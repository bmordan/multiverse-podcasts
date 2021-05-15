const fetch = require('node-fetch')
const {OAuth2Client} = require('google-auth-library')
const {
    NODE_ENV,
    PODCASTS_GOOGLE_CLIENT_ID
} = process.env

async function getGoogleUser(token) {
    let payload
    if (NODE_ENV === "dev") {
        const ticket = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`)
            .then(res => res.json())
            .then(payload => payload)
            .catch(console.err)
        payload = ticket
    } else {
        const gapi = new OAuth2Client(PODCASTS_GOOGLE_CLIENT_ID)
        const ticket = await gapi.verifyIdToken({
            idToken: token,
            audience: PODCASTS_GOOGLE_CLIENT_ID
        })
        payload = ticket.getPayload()
    }

    const { error, iss, aud, exp, hd } = payload
    return !error
        && (iss === "https://accounts.google.com" || iss === "accounts.google.com")
        && aud === PODCASTS_GOOGLE_CLIENT_ID
        && Number(exp) > Math.floor(new Date().getTime()/1000)
        && (hd === "whitehat.org.uk" || hd === "multiverse.io")
        && payload
}

module.exports = getGoogleUser