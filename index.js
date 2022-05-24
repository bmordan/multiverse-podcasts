const { version } = require('./package.json')
const express = require('express')
const fs = require('fs')
const app = express()
const path = require('path')
const session = require('express-session')
const { Podcast, Episode, Author, Download, sequelize } = require('./models')
const { Op } = require('sequelize')
const multer = require('multer')
const getGoogleUser = require('./lib/getGoogleUser')
const pug = require('pug')
const { Feed } = require('feed')
const checkDiscSpace = require('check-disk-space')
const MariaDBStore = require('express-session-mariadb-store')
const schedule = require('node-schedule')
const storage = multer.diskStorage({
    destination: (_, fileData, next) => {
        next(null, path.join(__dirname, 'public', 'uploads', fileData.fieldname))
    },
    filename: (_, fileData, next) => {
        next(null, new Date().getTime() + path.extname(fileData.originalname))
    }
})
const {
    BASE_URL = 'http://localhost:3333',
    PODCASTS_GOOGLE_CLIENT_ID,
    PODCASTS_GOOGLE_CLIENT_SECRET,
    NODE_ENV,
    PODCASTS_MYSQL_DATABASE,
    PODCASTS_MYSQL_USER,
    PODCASTS_MYSQL_PASSWORD
} = process.env

const session_settings_dev = {
    secret: PODCASTS_GOOGLE_CLIENT_SECRET,
    resave: false,
    saveUninitialized: true
}

const createSessionStore = () => {
    return NODE_ENV === 'production' ? new MariaDBStore({
        sessionTable: 'Sessions',
        host: 'mariadb',
        database: PODCASTS_MYSQL_DATABASE,
        user: PODCASTS_MYSQL_USER,
        password: PODCASTS_MYSQL_PASSWORD
    }) : {}
}

const session_settings_production = {
    ...session_settings_dev,
    store: createSessionStore()
}

const session_settings = NODE_ENV === 'production' ? session_settings_production : session_settings_dev
const publishingJobs = new Map()
const uploads = multer({ storage })
const defaultProps = { client_id: PODCASTS_GOOGLE_CLIENT_ID, version }

function protect(req, res, next) {
    !req.session.user ? res.redirect('/') : next()
}

async function trackRSS(req, _, next) {
    if (req.originalUrl.includes('/uploads/audio') && !req.query.ignore) {
        const [mp3] = req.originalUrl.match(/[\d]+\.mp3/)
        const episode = await Episode.findOne({
            where: {
                audio: {
                    [Op.like]: `${mp3}%`
                }
            }
        })
        if (episode) {
            await Download.create({referer: req.originalUrl, EpisodeId: episode.id})
        }
    }
    next()
}

async function publishPodcast(req, res) {
    console.log(`publishPodcast: ${new Date().toISOString()} triggered`)
    const podcast = await Podcast.findByPk(req.params.id, {
        include: {
            model: Episode
        }
    })

    const _author = await podcast.getAuthor()

    const author = {
        name: _author.name,
        email: _author.email,
        link: _author.avatar
    }

    delete podcast.AuthorId

    const feedFileName = podcast.title.split(' ').join('-').toLowerCase()

    const feedLinks = {
        rss: `${BASE_URL}/uploads/feeds/${feedFileName}.rss`,
        json: `${BASE_URL}/uploads/feeds/${feedFileName}.json`,
        atom: `${BASE_URL}/uploads/feeds/${feedFileName}.atom`
    }

    const feed = new Feed({ ...podcast.toJSON(), author, feedLinks })

    const now = new Date().getTime()

    podcast.Episodes.forEach(episode => {
        console.log({
            now: now,
            scheduled: episode.schedule,
            publish: episode.schedule > now
        })
        if (episode.schedule && episode.schedule > (now + 1000)) return
        const [filename, length, type] = episode.audio.split("|")

        feed.addItem({
            id: episode.id,
            title: episode.title,
            description: episode.description,
            content: episode.content,
            link: `${BASE_URL}/uploads/audio/${filename}`,
            date: episode.createdAt,
            audio: { url: `${BASE_URL}/uploads/audio/${filename}`, length, type },
            author: [author],
            published: new Date(episode.schedule || episode.createdAt),
            image: podcast.image
        })
    })

    feed.addCategory('Multiverse')

    fs.writeFileSync(path.join(__dirname, 'public', 'uploads', 'feeds', `${feedFileName}.rss`), feed.rss2())
    fs.writeFileSync(path.join(__dirname, 'public', 'uploads', 'feeds', `${feedFileName}.atom`), feed.atom1())
    fs.writeFileSync(path.join(__dirname, 'public', 'uploads', 'feeds', `${feedFileName}.json`), feed.json1())

    console.info(`🟢 Published ${feedFileName} at ${new Date().toLocaleString('en-GB')}`)

    res.sendStatus(201)
}

app.set('view engine', 'pug')
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(trackRSS)
app.use(express.static(__dirname + '/public'))
app.use(session(session_settings))


app.get('/', (req, res) => {
    req.session.user
        ? res.redirect('/podcasts')
        : res.render('login', defaultProps)
})

app.get('/users/:token', async (req, res) => {
    try {
        const gUser = await getGoogleUser(req.params.token)
        const [author] = await Author.findOrCreate({
            where: {
                gid: gUser.sub,
                name: gUser.given_name,
                email: gUser.email,
                avatar: gUser.picture
            }
        })
        req.session.user = author
        res.redirect('/podcasts')
    } catch (error) {
        res.render('error', { ...defaultProps, error })
    }
})

app.get('/podcasts', protect, async (req, res) => {
    const podcasts = await Podcast.findAll()
    res.render('podcasts', { ...defaultProps, user: req.session.user, podcasts })
})

app.post('/podcasts', [protect, uploads.single('image')], async (req, res) => {
    const podcast = await Podcast.create({
        title: req.body.title,
        description: req.body.description,
        content: req.body.description,
        image: `${BASE_URL}/uploads/image/${req.file.filename}`,
        AuthorId: req.session.user.id
    })
    await podcast.update({ link: `${BASE_URL}/podcasts/${podcast.id}` })
    res.sendStatus(201)
})

app.get('/podcasts/:id/publish', protect, publishPodcast)

app.get('/podcasts/:id', protect, async (req, res) => {
    const podcast = await Podcast.findByPk(req.params.id, {
        include: {
            model: Episode, nested: true
        },
        order: [
            [{ model: Episode }, 'title', 'DESC'],
        ]
    })
    const feedFileName = podcast.title.split(' ').join('-').toLowerCase()
    let _feed;
    try {
        _feed = fs.readFileSync(path.join(__dirname, 'public', 'uploads', 'feeds', `${feedFileName}.json`))
    } catch (err) {
        if (err.code !== 'ENOENT') console.error(err)
        _feed = `{"items": []}`
    } finally {
        const feedTitles = JSON.parse(_feed).items.map(item => item.title)
        for (const episode of podcast.Episodes) {
            episode.status = feedTitles.includes(episode.title) ? "🟢" : "🟠"
            episode.status = episode.status === "🟠" && episode.schedule > new Date().getTime() ? "🕗" : episode.status

            episode.downloads = await Download.count({
                where: {
                    EpisodeId: episode.id
                }
            }) / 2
        }
        res.render('podcast', { ...defaultProps, user: req.session.user, podcast })
    }
})

app.get('/podcasts/:id/edit', protect, async (req, res) => {
    const podcast = await Podcast.findByPk(req.params.id, { include: { model: Episode, nested: true } })
    res.render('podcast_edit', { ...defaultProps, user: req.session.user, podcast })
})

app.post('/podcasts/:id/edit', [protect, uploads.single('image')], async (req, res) => {
    const podcast = await Podcast.findByPk(req.params.id, { include: { model: Episode, nested: true } })
    let update = {
        id: podcast.id,
        title: req.body.title || podcast.title,
        description: req.body.description || podcast.title,
        content: null,
        image: req.file ? `${BASE_URL}/uploads/image/${req.file.filename}` : podcast.image,
        link: podcast.link
    }
    await podcast.update(update)
    const html = pug.renderFile(path.join(__dirname, 'views', 'podcast_edit_podcast.pug'), { podcast: update })
    res.send(html)
})

app.post('/podcasts/:id/episodes', [protect, uploads.single('audio')], async (req, res) => {
    const podcast = await Podcast.findByPk(req.params.id)
    let publishAt = { getTime: function () { return null } }
    if (req.body.date && req.body.time) {
        publishAt = new Date(`${req.body.date}T${req.body.time}`)
    }
    // check the file info
    console.log(req.file)
    // some episodes are being saved as [object Object]
    const episode = await podcast.createEpisode({
        title: req.body.title,
        description: req.body.description,
        link: `${BASE_URL}/uploads/audio/${req.file.filename}`,
        content: req.body.content,
        audio: [req.file.filename, req.file.size, req.file.mimetype].join("|"),
        schedule: publishAt.getTime()
    })

    if (episode.schedule && !publishingJobs.has(`${podcast.id}-${publishAt.getTime()}`)) {
        const job = schedule.scheduleJob(publishAt, publishPodcast.bind(this, req, { sendStatus: () => { } }))
        publishingJobs.set(`${podcast.id}-${publishAt.getTime()}`, job)
    }

    episode.status = episode.schedule ? "🕗" : "🟠"

    const html = pug.renderFile(path.join(__dirname, 'views', 'episode.pug'), { episode })
    res.send(html)
})

app.post('/podcasts/:podcast_id/episodes/:id/edit', [protect, uploads.single('audio')], async (req, res) => {
    const podcast = { id: req.params.podcast_id }
    const episode = await Episode.findByPk(req.params.id)
    let publishAt = { getTime: function () { return null } }
    if (episode.schedule
        && publishingJobs.has(`${podcast.id}-${episode.schedule}`)
        && req.body.date
        && req.body.time
        && episode.schedule > new Date().getTime()
    ) {
        // this episode was scheduled cancel it
        publishingJobs.get(`${podcast.id}-${episode.schedule}`).cancel()
    }
    if (req.body.date && req.body.time) {
        // we have a date and time to schedule
        publishAt = new Date(`${req.body.date}T${req.body.time}`)
    }
    if (publishAt.getTime > new Date().getTime) {
        const job = schedule.scheduleJob(publishAt, publishPodcast.bind(this, req, { sendStatus: () => { } }))
        publishingJobs.set(`${podcast.id}-${publishAt.getTime()}`, job)
    }
    const update = {
        id: episode.id,
        title: req.body.title || episode.title,
        description: req.body.description || episode.description,
        content: req.body.content || episode.content,
        link: req.file ? `${BASE_URL}/uploads/audio/${req.file.filename}` : episode.link,
        audio: req.file ? [req.file, req.file.size, req.file.mimetype].join("|") : episode.audio,
        schedule: publishAt.getTime()
    }
    await episode.update(update)
    const html = pug.renderFile(path.join(__dirname, 'views', 'podcast_edit_episode.pug'), { podcast, episode })
    res.send(html)
})

app.get('/podcasts/:id/delete', protect, async (req, res) => {
    const podcast = await Podcast.findByPk(req.params.id)
    const feedFileName = podcast.title.split(' ').join('-').toLowerCase()
    await podcast.destroy()
    try {
        fs.unlinkSync(path.join(__dirname, 'public', 'uploads', 'feeds', `${feedFileName}.rss`))
        fs.unlinkSync(path.join(__dirname, 'public', 'uploads', 'feeds', `${feedFileName}.atom`))
        fs.unlinkSync(path.join(__dirname, 'public', 'uploads', 'feeds', `${feedFileName}.json`))
    } finally {
        res.sendStatus(204)
    }
})

app.get('/episodes/:id/delete', protect, async (req, res) => {
    const episode = await Episode.findByPk(req.params.id)
    if (episode.schedule && publishingJobs.has(`${episode.PodcastId}-${episode.schedule}`)) {
        publishingJobs.get(`${episode.PodcastId}-${episode.schedule}`).cancel()
        publishingJobs.delete(`${episode.PodcastId}-${episode.schedule}`)
    }
    await episode.destroy()
    res.sendStatus(204)
})

app.get('/help', (req, res) => {
    res.render('help')
})

app.get('/signout', (req, res) => {
    req.session.user = undefined
    res.sendStatus(200)
})

app.listen(3333, async () => {
    await sequelize.sync()
    const episodes = await Episode.findAll()
    const startUpTime = new Date().getTime()
    checkDiscSpace(path.join(__dirname))
        .then(diskSpace => {
            console.table({
                application: "Multiverse Podcasts",
                startUpTime: new Date(startUpTime).toLocaleString(),
                podcasts: episodes.length,
                size: diskSpace.size,
                free: diskSpace.free,
                used: `${(Math.round((diskSpace.free / diskSpace.size) * 100) - 100) * -1}%`
            })

            episodes
                .filter(episode => {
                    return episode.schedule && episode.schedule > startUpTime
                })
                .map(async (episode) => {
                    const podcast = await Podcast.findByPk(episode.PodcastId)
                    publishingJobs.set(`${episode.PodcastId}-${episode.schedule}`, publishPodcast.bind(this, { params: { id: podcast.id } }, { sendStatus: () => { } }))
                    console.info(`🟠 ${episode.PodcastId} ${new Date(episode.schedule).toLocaleString('en-GB')}`)
                })
        })
})
