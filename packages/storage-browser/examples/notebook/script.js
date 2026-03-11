import { createIndexedDB } from 'https://cdn.jsdelivr.net/npm/@anabranch/storage-browser@0.1.3/+esm'
import { Storage } from 'https://cdn.jsdelivr.net/npm/@anabranch/storage@0.1.3/+esm'

const status = document.getElementById('status')
const notesContainer = document.getElementById('notes')

const connector = createIndexedDB({ prefix: 'notebook/' })
const storage = await Storage.connect(connector).run()

setStatus('Ready')
loadNotes()

document.getElementById('saveBtn').addEventListener('click', async () => {
  const title = document.getElementById('title').value.trim()
  const content = document.getElementById('content').value.trim()
  if (!title || !content) return

  const note = {
    id: Date.now().toString(),
    title,
    content,
    createdAt: new Date().toISOString(),
  }

  await storage.put(`notes/${note.id}`, JSON.stringify(note))
    .tapErr((err) => setStatus('Save failed: ' + err.message))
    .tap(() => setStatus('Note saved!'))
    .run()

  document.getElementById('title').value = ''
  document.getElementById('content').value = ''
  loadNotes()
})

async function loadNotes() {
  notesContainer.innerHTML = ''

  const notes = await storage.list('notes/')
    .tryMap(
      async (entry) => {
        const { body } = await storage.get(entry.key).run()
        return JSON.parse(await new Response(body).text())
      },
      () => {
        setStatus('Load error - skipping note')
        return null
      },
    )
    .filter((note) => note !== null)
    .map((note) => {
      const div = document.createElement('div')
      div.innerHTML = `<div class="note-item">
        <div class="note-title">${escapeHtml(note.title)}</div>
        <div class="note-preview">${
        escapeHtml(note.content.substring(0, 100))
      }${note.content.length > 100 ? '...' : ''}</div>
        <div class="note-meta">${
        new Date(note.createdAt).toLocaleString()
      }</div>
        <div class="actions">
          <button class="danger delete-note" data-id="${note.id}">Delete</button>
        </div>
      </div>`
      return {
        note,
        div,
      }
    })
    .fold((acc, item) => {
      // Insertion sort by createdAt descending
      const spliceIndex = acc.findIndex((n) =>
        new Date(n.note.createdAt) < new Date(item.note.createdAt)
      )
      if (spliceIndex === -1) {
        acc.push(item)
      } else {
        acc.splice(spliceIndex, 0, item)
      }
      return acc
    }, [])

  if (notes.length === 0) {
    notesContainer.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p>No notes yet. Add one above!</p>
      </div>
    `
    return
  }

  for (const { div } of notes) {
    notesContainer.appendChild(div)
  }

  notesContainer.querySelectorAll('.delete-note').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await storage.delete(`notes/${btn.dataset.id}`)
        .tapErr((err) => setStatus('Delete failed: ' + err.message))
        .run()
      setStatus('Note deleted')
      loadNotes()
    })
  })
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function setStatus(msg) {
  status.textContent = msg
  status.classList.add('visible')
  setTimeout(() => status.classList.remove('visible'), 2000)
}
