const { download } = require('express/lib/response')
const { Model, DataTypes, Sequelize } = require('sequelize')
const {
    NODE_ENV,
    PODCASTS_MYSQL_DATABASE,
    PODCASTS_MYSQL_USER,
    PODCASTS_MYSQL_PASSWORD
} = process.env

const sequelize_settings_production = {
    host: 'mariadb',
    dialect: 'mariadb',
    dialectOptions: {
        timezone: 'Etc/GMT+0'
    },
    pool: {
        min: 0,
        max: 2,
        idle: 10000
    }
}

const sequelize_settings_dev = {
    dialect: 'sqlite',
    storage: './db.sqlite',
    logging: false
}

let sequelize_settings = NODE_ENV === 'dev' ? sequelize_settings_dev : sequelize_settings_production

const sequelize = new Sequelize(PODCASTS_MYSQL_DATABASE, PODCASTS_MYSQL_USER, PODCASTS_MYSQL_PASSWORD, sequelize_settings)

class Podcast extends Model{}
class Episode extends Model{}
class FeedLink extends Model{}
class Author extends Model{}
class Session extends Model{}
class Download extends Model{}

Session.init({
    sid:{
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    session: {
        type: DataTypes.STRING(2048),
        defaultValue: "{}"
    },
    lastSeen: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW
    }
}, {sequelize})

Podcast.init({
    id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true
    },
    title: DataTypes.STRING(2048),
    description: DataTypes.TEXT,
    link: DataTypes.STRING,
    language: {
        type: DataTypes.STRING,
        defaultValue: "en"
    },
    image: DataTypes.STRING(2048),
    favicon: {
        type: DataTypes.STRING,
        defaultValue: "/favicon.ico"
    },
    copyright: {
        type: DataTypes.STRING,
        defaultValue: "© all rights reserved 2021, Multiverse Ltd"
    },
    generator: {
        type: DataTypes.STRING,
        defaultValue: "Multiverse Podcasts"
    }
}, {sequelize})

FeedLink.init({
    feedType: DataTypes.STRING,
    feedUrl: DataTypes.STRING
}, {sequelize})

Episode.init({
    id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true
    },
    title: DataTypes.STRING,
    link: DataTypes.STRING,
    description: DataTypes.TEXT,
    content: DataTypes.TEXT,
    audio: DataTypes.STRING(2048),
    schedule: DataTypes.INTEGER
}, {sequelize})

Download.init({
    referer: DataTypes.STRING
}, {sequelize})

Author.init({
    gid: DataTypes.STRING,
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    avatar: DataTypes.STRING
}, {sequelize})

Podcast.hasMany(Episode)
Episode.belongsTo(Podcast)
Author.hasOne(Podcast)
Episode.hasMany(Download)
Download.belongsTo(Episode)
Podcast.belongsTo(Author)

module.exports = {
    Podcast,
    Episode,
    Author,
    Podcast,
    Episode,
    Download,
    FeedLink,
    sequelize
}

