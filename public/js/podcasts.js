function onTitle (event) {
    const element = document.querySelector('#preview .card-body .card-title')
    element.innerHTML = event.target.value
}
function onDescription (event) {
    const element = document.querySelector('#preview .card-body .card-text')
    element.innerHTML = event.target.value
}
function onImage (event) {
    const src = URL.createObjectURL(event.target.files[0])
    const element = document.querySelector('#preview img')
    element.setAttribute('src', src)
}
function onSubmit (form) {
    fetch('/podcasts', {
        method: "POST",
        body: new FormData(form)
    }).then(res => {
        if (res.status === 201) window.location.href = `${window.location.origin}/podcasts`
    }).catch(console.error)
}
function onUpdate (form) {
    const formData = new FormData(form)
    fetch(`/podcasts/${formData.get('id')}/edit`, {
        method: "POST",
        body: formData
    }).then(res => res.text())
    .then(updatedPodcastFragment => {
        $('.podcast_edit').empty().append(updatedPodcastFragment)
    })
}
function onUpdateEpisode (form, podcast_id) {
    const formData = new FormData(form)
    fetch(`/podcasts/${podcast_id}/episodes/${formData.get('id')}/edit`, {
        method: "POST",
        body: formData
    }).then(res => res.text())
    .then(updatedPodcastFragment => {
        $(`#${formData.get('id')}`).empty().html(updatedPodcastFragment)
    })
}
function removeEpisode(id) {
    $(`#${id}`).remove()
    fetch(`/episodes/${id}/delete`)
}