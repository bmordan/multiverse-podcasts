const SUNEDITORS = new Map()
function onPodcastTitle (event) {
    const element = document.querySelector('#preview .card-body .card-title')
    element.innerHTML = event.target.value
}
function onPodcastDescription (event) {
    const element = document.querySelector('#preview .card-body .card-text')
    element.innerHTML = event.target.value
}
function onPodcastImage (event) {
    const src = URL.createObjectURL(event.target.files[0])
    const element = document.querySelector('#preview img')
    element.setAttribute('src', src)
}
function onPodcastSubmit (form) {
    fetch('/podcasts', {
        method: "POST",
        body: new FormData(form)
    }).then(res => {
        if (res.status === 201) window.location.href = `${window.location.origin}/podcasts`
    }).catch(console.error)
}
function onPodcastUpdate (form) {
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
    const id = formData.get('id')
    const editor = SUNEDITORS.get(`${id}-content`)
    formData.set('content', editor.getContents())
    fetch(`/podcasts/${podcast_id}/episodes/${id}/edit`, {
        method: "POST",
        body: formData
    }).then(res => res.text())
    .then(updatedPodcastFragment => {
        console.log(updatedPodcastFragment)
        SUNEDITORS.delete(`${id}-content`)
        $(`#${id}`).empty().html(updatedPodcastFragment)
        SUNEDITORS.set(`${id}-content`, createSunEditorInstance(`${id}-content`))
    })
}

function onEpisodeTitle (event) {
    const element = document.querySelector('#preview .card-body .card-title')
    element.innerHTML = event.target.value
}
function onEpisodeDescription (event) {
    const element = document.querySelector('#preview .card-body .card-text')
    element.innerHTML = event.target.value
}
function onEpisodeSubmit (form) {
    $('#add-episode-component').addClass('uploading')
    const formData = new FormData(form)
    const editor = SUNEDITORS.get('default')
    formData.set('content', editor.getContents())
    fetch(`/podcasts/${formData.get('podcast_id')}/episodes`, {
        method: "POST",
        body: formData
    })
    .then(res => res.text())
    .then(podcast => {
        $('#episodes').prepend(podcast)
        $('#add-episode').trigger('reset')
        editor.setContents("")
        $('#add-episode-component').removeClass('uploading')
        $('#add-episode-component').collapse('hide')
        $('[data-toggle="tooltip"]').tooltip()
    })
    .catch(console.error)
}
function scrollComponentIntoView (component) {
    if ($(`#add-${component}-component`).length) {
        $(`#add-${component}-component`).on('shown.bs.collapse', function () {
            $(`#add-${component}-component`).get(0).scrollIntoView({
                behavior: "smooth",
                block: "start"
            })
        })
    }   
}
function init() {    
    if ($('.episode').length) {
        $('#publish-sm').removeAttr('disabled')
        $('#publish-lg').removeAttr('disabled')
    }
    
    $('[data-toggle="tooltip"]').tooltip()
    
    ;['podcast', 'episode'].forEach(scrollComponentIntoView)
}
function publish(id) {
    fetch(`/podcasts/${id}/publish`)
        .then(res => {
            if (res.status === 201) {
                $('#publish-sm').attr('disabled', 'disabled')
                $('#publish-lg').attr('disabled', 'disabled')
                window.location.reload()
            }
        })
        .catch(console.error)
}

function toggleShowNotes(id) {
    $(id).collapse('toggle')
}

function removeEpisode(id) {
    $(`#${id}`).remove()
    fetch(`/episodes/${id}/delete`)
}

function deletePodcast(id) {
    fetch(`/podcasts/${id}/delete`)
        .then(() => {
            window.location.href = '/podcasts'
        })
        .catch(console.error)
}

function copyToClipboard(ext) {
    const url = document.getElementById(ext).innerHTML
    navigator.clipboard.writeText(url)
    $('#modal').modal('hide')
}
if ($('#episode-content').length) {
    const editor = SUNEDITOR.create('episode-content', {
        lang: SUNEDITOR_LANG['en'],
        buttonList: [
            ['font', 'fontSize', 'formatBlock'],
            ['table', 'link'],
            ['align', 'horizontalRule', 'list'],
            ['undo', 'redo'],
        ],
        height: '12rem'
    })
    
    editor.onChange = function (contents, core) {
        $('#card-content').html(contents)
    }

    SUNEDITORS.set('default', editor)
}

function createSunEditorInstance (id) {
    return SUNEDITOR.create(id, {
        lang: SUNEDITOR_LANG['en'],
        buttonList: [
            ['font', 'fontSize', 'formatBlock'],
            ['table', 'link'],
            ['align', 'horizontalRule', 'list'],
            ['undo', 'redo'],
        ],
        height: '12rem'
    })
}

if ($('.content-edit').length) {
    $('.content-edit').each(function() {
        SUNEDITORS.set($(this).attr('id'), createSunEditorInstance($(this).attr('id')))
    })
}

init()

