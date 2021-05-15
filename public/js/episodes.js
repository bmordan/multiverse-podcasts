function onTitle (event) {
    const element = document.querySelector('#preview .card-body .card-title')
    element.innerHTML = event.target.value
}
function onDescription (event) {
    const element = document.querySelector('#preview .card-body .card-text')
    element.innerHTML = event.target.value
}
function onSubmit (form) {
    const formData = new FormData(form)
    console.log("onSubmit", `/podcasts/${formData.get('podcast_id')}/episodes`)
    fetch(`/podcasts/${formData.get('podcast_id')}/episodes`, {
        method: "POST",
        body: formData
    })
    .then(res => res.text())
    .then(podcast => {
        $('#episodes .episode').length ? $('#episodes').append(podcast) : $('#episodes').prepend(podcast)
        $('#add-episode-component').collapse('hide')
    })
    .catch(console.error)
}
function init() {
    $('#add-episode-component').on('show.bs.collapse', function () {
        console.log('TODO: scroll into view')
    })
    
    if ($('.episode').length) $('#publish').removeAttr('disabled')
}
function publish(id) {
    fetch(`/podcasts/${id}/publish`)
        .then(res => {
            if (res.status === 201) {
                $('#publish').attr('disabled', 'disabled')
            }
        })
        .catch(console.error)
}
init()
