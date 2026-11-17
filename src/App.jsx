import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL

async function requestTodos(path = '', options = {}) {
  const headers = { Accept: 'application/json' }
  const request = { method: options.method ?? 'GET', headers }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    request.body = JSON.stringify(options.body)
  }

  let response
  try {
    response = await fetch(`${API_URL}${path}`, request)
  } catch (error) {
    throw new Error('서버에 연결할 수 없습니다. 네트워크 연결과 백엔드 서버 상태를 확인해 주세요.', { cause: error })
  }

  let result
  try {
    result = await response.json()
  } catch (error) {
    throw new Error(`서버 응답을 읽을 수 없습니다. (${response.status})`, { cause: error })
  }

  if (!response.ok) {
    throw new Error(result?.error || `요청에 실패했습니다. (${response.status})`)
  }

  return result
}

function Icon({ name, size = 18 }) {
  const paths = {
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6" /><path d="M10 11v5m4-5v5" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    sparkles: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" /></>,
  }

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function App() {
  const [todos, setTodos] = useState([])
  const [today] = useState(() => new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date()))
  const [newText, setNewText] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const [editingTodo, setEditingTodo] = useState(null)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [busyTodoIds, setBusyTodoIds] = useState(() => new Set())
  const editDialogRef = useRef(null)
  const editInputRef = useRef(null)

  useEffect(() => {
    let active = true

    async function loadTodos() {
      setLoading(true)
      setLoadFailed(false)
      setNotice('')
      try {
        const result = await requestTodos()
        if (!Array.isArray(result)) throw new Error('서버 응답 형식이 올바르지 않습니다.')
        if (active) setTodos(result)
      } catch (error) {
        if (active) {
          setNotice(error.message)
          setLoadFailed(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadTodos()
    return () => { active = false }
  }, [reloadKey])

  useEffect(() => {
    const dialog = editDialogRef.current
    if (editingTodo && dialog && !dialog.open) {
      dialog.showModal()
      editInputRef.current?.focus()
      editInputRef.current?.select()
    } else if (!editingTodo && dialog?.open) {
      dialog.close()
    }
  }, [editingTodo])

  const remainingCount = todos.filter((todo) => !todo.completed).length
  const completedCount = todos.length - remainingCount
  const progress = todos.length ? Math.round((completedCount / todos.length) * 100) : 0
  const visibleTodos = useMemo(() => todos.filter((todo) => {
    if (filter === 'active') return !todo.completed
    if (filter === 'completed') return todo.completed
    return true
  }), [filter, todos])

  async function addTodo(event) {
    event.preventDefault()
    const text = newText.trim()
    if (!text || adding) return

    setAdding(true)
    setNotice('')
    try {
      const todo = await requestTodos('', { method: 'POST', body: { text } })
      setTodos((current) => [todo, ...current])
      setNewText('')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setAdding(false)
    }
  }

  async function updateTodo(todo, updates) {
    if (busyTodoIds.has(todo.id)) return

    setBusyTodoIds((current) => new Set(current).add(todo.id))
    setNotice('')
    try {
      const updatedTodo = await requestTodos(`/${encodeURIComponent(todo.id)}`, {
        method: 'PATCH',
        body: updates,
      })
      setTodos((current) => current.map((item) => item.id === todo.id ? updatedTodo : item))
      return updatedTodo
    } catch (error) {
      setNotice(error.message)
      return null
    } finally {
      setBusyTodoIds((current) => {
        const next = new Set(current)
        next.delete(todo.id)
        return next
      })
    }
  }

  async function deleteTodo(todo) {
    if (busyTodoIds.has(todo.id)) return

    setBusyTodoIds((current) => new Set(current).add(todo.id))
    setNotice('')
    try {
      await requestTodos(`/${encodeURIComponent(todo.id)}`, { method: 'DELETE' })
      setTodos((current) => current.filter((item) => item.id !== todo.id))
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusyTodoIds((current) => {
        const next = new Set(current)
        next.delete(todo.id)
        return next
      })
    }
  }

  function startEditing(todo) {
    setEditText(todo.text)
    setEditingTodo(todo)
  }

  async function saveEdit(event) {
    event.preventDefault()
    const text = editText.trim()
    if (!text || !editingTodo || savingEdit) return

    setSavingEdit(true)
    const updatedTodo = await updateTodo(editingTodo, { text })
    setSavingEdit(false)
    if (updatedTodo) setEditingTodo(null)
  }

  function handleDialogClose() {
    if (!savingEdit) setEditingTodo(null)
  }

  return (
    <main className="page-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="app-content">
        <header className="topbar">
          <a className="brand" href="/" aria-label="오늘의 할 일 홈">
            <span className="brand-mark"><Icon name="check" size={18} /></span>
            <span>하루기록</span>
          </a>
          <span className="today-label"><Icon name="calendar" size={15} />{today}</span>
        </header>

        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow"><Icon name="sparkles" size={15} /> MAKE TODAY COUNT</p>
          <h1 id="page-title">오늘의 할 일<span>.</span></h1>
          <p className="intro-copy">작은 한 걸음이 모여 멋진 하루를 만들어요.</p>
        </section>

        <section className="overview" aria-label="오늘의 진행 상황">
          <div className="overview-copy">
            <span className="overview-kicker">오늘의 진행 상황</span>
            <strong>{remainingCount === 0 && todos.length > 0 ? '모두 해냈어요!' : `${remainingCount}개의 할 일이 남았어요`}</strong>
            <span className="overview-caption">{completedCount}개 완료 <span className="caption-dot">·</span> 차근차근 해봐요</span>
          </div>
          <div className="progress-ring" style={{ '--progress': `${progress}%` }} aria-label={`할 일 ${progress}% 완료`}>
            <div className="progress-inner">
              <strong>{progress}<small>%</small></strong>
              <span>완료</span>
            </div>
          </div>
          <span className="overview-decoration decoration-one" />
          <span className="overview-decoration decoration-two" />
        </section>

        <section className="todo-panel" aria-labelledby="list-title">
          <form className="add-form" onSubmit={addTodo}>
            <label className="sr-only" htmlFor="new-todo">새 할 일 입력</label>
            <span className="input-icon"><Icon name="plus" size={20} /></span>
            <input
              id="new-todo"
              type="text"
              maxLength={120}
              placeholder="새로운 할 일을 입력하세요"
              value={newText}
              onChange={(event) => setNewText(event.target.value)}
              disabled={adding}
            />
            <button className="add-button" type="submit" disabled={adding || !newText.trim()}>
              {adding ? '추가 중' : '추가하기'} <Icon name="plus" size={17} />
            </button>
          </form>

          <div className="list-heading">
            <div>
              <h2 id="list-title">나의 할 일</h2>
              <p>{todos.length}개의 할 일 <span>·</span> {remainingCount}개 남음</p>
            </div>
            <div className="filters" role="group" aria-label="할 일 필터">
              {[
                ['all', '전체'],
                ['active', '진행 중'],
                ['completed', '완료'],
              ].map(([value, label]) => (
                <button
                  className={`filter-button${filter === value ? ' is-active' : ''}`}
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  {value === 'all' && <span className="filter-count">{todos.length}</span>}
                </button>
              ))}
            </div>
          </div>

          {notice && (
            <div className="notice" role="alert">
              <span>{notice}</span>
            </div>
          )}

          {loading ? (
            <div className="loading-state" role="status"><span className="spinner" />할 일을 불러오고 있어요</div>
          ) : loadFailed ? (
            <div className="empty-state">
              <span className="empty-illustration"><Icon name="sparkles" size={25} /></span>
              <strong>할 일을 불러오지 못했어요</strong>
              <p>서버 연결을 확인하고 다시 시도해 주세요.</p>
              <button className="retry-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>다시 시도</button>
            </div>
          ) : visibleTodos.length > 0 ? (
            <ul className="todo-list">
              {visibleTodos.map((todo) => {
                const busy = busyTodoIds.has(todo.id)
                return (
                  <li className={`todo-item${todo.completed ? ' is-completed' : ''}`} key={todo.id}>
                    <label className="checkbox-wrap">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        disabled={busy}
                        onChange={(event) => updateTodo(todo, { completed: event.target.checked })}
                        aria-label={`${todo.text} 완료`}
                      />
                      <span className="custom-checkbox"><Icon name="check" size={14} /></span>
                    </label>
                    <span className="todo-text">{todo.text}</span>
                    <div className="todo-actions">
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => startEditing(todo)}
                        disabled={busy}
                        aria-label={`${todo.text} 수정`}
                        title="수정"
                      >
                        <Icon name="edit" size={17} />
                      </button>
                      <button
                        className="icon-button delete-button"
                        type="button"
                        onClick={() => deleteTodo(todo)}
                        disabled={busy}
                        aria-label={`${todo.text} 삭제`}
                        title="삭제"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="empty-illustration"><Icon name={filter === 'completed' ? 'check' : 'sparkles'} size={25} /></span>
              <strong>
                {filter === 'active' ? '진행 중인 할 일이 없어요' : filter === 'completed' ? '아직 완료한 일이 없어요' : '아직 등록된 할 일이 없어요'}
              </strong>
              <p>
                {filter === 'all' ? '새로운 할 일을 추가하고 오늘을 시작해 보세요.' : '다른 할 일도 확인해 보세요.'}
              </p>
            </div>
          )}

          <footer className="panel-footer">
            <span><span className="footer-dot" /> 오늘도 한 걸음씩</span>
            <span>{completedCount} / {todos.length} 완료</span>
          </footer>
        </section>
        <p className="page-note">오늘의 작은 성취를 응원해요 <span>✦</span></p>
      </div>

      <dialog
        className="edit-dialog"
        ref={editDialogRef}
        onClose={handleDialogClose}
        onCancel={(event) => { if (savingEdit) event.preventDefault() }}
      >
        <form onSubmit={saveEdit}>
          <div className="dialog-heading">
            <div>
              <span className="dialog-kicker">EDIT TASK</span>
              <h2>할 일 수정</h2>
            </div>
            <button className="icon-button" type="button" onClick={() => setEditingTodo(null)} disabled={savingEdit} aria-label="수정 창 닫기">
              <Icon name="close" />
            </button>
          </div>
          <label className="sr-only" htmlFor="edit-todo">할 일 내용</label>
          <input
            ref={editInputRef}
            id="edit-todo"
            className="edit-input"
            type="text"
            maxLength={120}
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            required
          />
          <div className="dialog-actions">
            <button className="cancel-button" type="button" onClick={() => setEditingTodo(null)} disabled={savingEdit}>취소</button>
            <button className="save-button" type="submit" disabled={savingEdit || !editText.trim()}>
              {savingEdit ? '저장 중' : '변경 사항 저장'}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  )
}

export default App
