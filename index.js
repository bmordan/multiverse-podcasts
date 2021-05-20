const { version } = require('./package.json')
const express = require('express')
const fs = require('fs')
const app = express()
const path = require('path')
const session = require('express-session')
const { Podcast, Episode, Author, sequelize } = require('./models')
const multer = require('multer')
const getGoogleUser = require('./lib/getGoogleUser')
const pug = require('pug')
const { Feed } = require('feed')
const checkDiscSpace = require('check-disk-space')
const MariaDBStore = require('express-session-mariadb-store')
const { file } = require('googleapis/build/src/apis/file')
const storage = multer.diskStorage({
    destination: (req, fileData, next) => {
        next(null, path.join(__dirname, 'public', 'uploads', fileData.fieldname))
    },
    filename: (req, fileData, next) => {
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
    return NODE_ENV==='production' ? new MariaDBStore({
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


const uploads = multer({ storage })

const defaultProps = { client_id: PODCASTS_GOOGLE_CLIENT_ID, version }

function protect(req, res, next) {
    !req.session.user ? res.redirect('/') : next()
}

app.set('view engine', 'pug')
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.static('public'))
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
        link: `${BASE_URL}/uploads/feeds/`
    })
    res.sendStatus(201)
})

app.get('/podcasts/:id/publish', protect, async (req, res) => {
    const podcast = await Podcast.findByPk(req.params.id, {
        include: {
            model: Episode
        }
    })
    const author = {
        name: req.session.user.name,
        email: req.session.user.email
    }
    
    const feedFileName = podcast.title.split(' ').join('-').toLowerCase()
    
    const feedLinks = {
        json: `${BASE_URL}/uploads/feeds/${feedFileName}.json`,
        atom: `${BASE_URL}/uploads/feeds/${feedFileName}.atom`
    }

    const feed = new Feed({ ...podcast.toJSON(), author, feedLinks })

    podcast.Episodes.forEach(episode => {
        const [filename, length, type] = episode.audio.split("|")

        feed.addItem({
            id: episode.id,
            title: episode.title,
            description: episode.description,
            content: episode.content,
            date: episode.createdAt,
            audio: { url: `${BASE_URL}/uploads/audio/${filename}`, length, type },
            author: [author],
            published: new Date(episode.createdAt)
        })
    })

    feed.addCategory('Multiverse')

    fs.writeFileSync(path.join(__dirname, 'public', 'uploads', 'feeds', `${feedFileName}.rss`), feed.rss2())
    fs.writeFileSync(path.join(__dirname, 'public', 'uploads', 'feeds', `${feedFileName}.atom`), feed.atom1())
    fs.writeFileSync(path.join(__dirname, 'public', 'uploads', 'feeds', `${feedFileName}.json`), feed.json1())

    res.sendStatus(201)
})

app.get('/podcasts/:id', protect, async (req, res) => {
    const podcast = await Podcast.findByPk(req.params.id, { include: { model: Episode, nested: true } })
    res.render('podcast', { ...defaultProps, user: req.session.user, podcast })
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
        link: req.file ? `${BASE_URL}/uploads/audio/${req.file.filename}` : podcast.link
    }
    await podcast.update(update)
    const html = pug.renderFile(path.join(__dirname, 'views', 'podcast_edit_podcast.pug'), { podcast: update })
    res.send(html)
})

app.post('/podcasts/:id/episodes', [protect, uploads.single('audio')], async (req, res) => {
    const podcast = await Podcast.findByPk(req.params.id)
    const episode = await podcast.createEpisode({
        title: req.body.title,
        description: req.body.description,
        link: `${BASE_URL}/uploads/audio/${req.file.filename}`,
        content: req.body.content,
        audio: [req.file.filename, req.file.size, req.file.mimetype].join("|")
    })

    const html = pug.renderFile(path.join(__dirname, 'views', 'episode.pug'), { episode })
    res.send(html)
})

app.post('/podcasts/:podcast_id/episodes/:id/edit', [protect, uploads.single('audio')], async (req, res) => {
    const podcast = { id: req.params.podcast_id }
    const episode = await Episode.findByPk(req.params.id)
    const update = {
        id: episode.id,
        title: req.body.title || episode.title,
        description: req.body.description || episode.description,
        content: req.body.content || episode.content,
        link: req.file ? `${BASE_URL}/uploads/audio/${req.file.filename}` : episode.link,
        audio: req.file ? [req.file, req.file.size, req.file.mimetype].join("|") : episode.audio
    }
    await episode.update(update)
    const html = pug.renderFile(path.join(__dirname, 'views', 'podcast_edit_episode.pug'), { podcast, episode })
    console.log(html)
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
    await episode.destroy()
    res.sendStatus(204)
})

app.get('/signout', (req, res) => {
    req.session.user = undefined
    res.sendStatus(200)
})

app.listen(3333, async () => {
    await sequelize.sync()
    const episodes = await Episode.findAndCountAll()
    checkDiscSpace(path.join(__dirname)).then(diskSpace => {
        console.table({
            application: "Multiverse Podcasts",
            podcasts: episodes.count,
            size: diskSpace.size,
            free: diskSpace.free,
            used: `${(Math.round((diskSpace.free/diskSpace.size)*100) - 100) * -1}%`
        })
    })
})

