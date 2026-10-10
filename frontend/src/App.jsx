import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowLeft, ArrowUpRight, BadgeCheck,
  Bell, CircleHelp, ClipboardCheck, Clock3, Computer,
  FileBarChart, History, LayoutDashboard, LogOut, Mail, Menu, Pencil, Plus, QrCode, ScanLine,
  Camera, Search, Settings2, ShieldCheck, ShieldQuestion, Trash2, UserRound, Users, X
} from 'lucide-react'
import { apiRequest } from './api'
import './App.css'

const roleConfig = {
  Student: {
    name: 'Alice Mugisha', initials: 'AM', subtitle: 'Student portal',
    nav: [
      { label: 'Workspace', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'register', label: 'Register PC', icon: Plus }, { id: 'devices', label: 'My devices', icon: Computer }, { id: 'status', label: 'Registration status', icon: BadgeCheck }] },
    ],
  },
  'Gate officer': {
    name: 'Emmanuel K.', initials: 'EK', subtitle: 'Gate operations',
    nav: [
      { label: 'Verification', items: [{ id: 'verify', label: 'Verify PC', icon: ScanLine }, { id: 'history', label: 'Verification history', icon: History }, { id: 'alerts', label: 'Alerts', icon: AlertTriangle, badge: true }] },
    ],
  },
  Administrator: {
    name: 'Diane U.', initials: 'DU', subtitle: 'System administration',
    nav: [
      { label: 'Administration', items: [{ id: 'users', label: 'Manage users', icon: Users }, { id: 'devices', label: 'Manage PCs', icon: Computer }, { id: 'logs', label: 'View logs', icon: ClipboardCheck }, { id: 'reports', label: 'Reports', icon: FileBarChart }] },
    ],
  },
}

const viewTitles = {
  overview: ['Overview', 'A clear view of your registered devices and campus activity.'],
  register: ['Register a PC', 'Add a computer using its manufacturer serial number.'],
  devices: ['My devices', 'All computers registered to your student ID.'],
  status: ['Registration status', 'Your device approvals at a glance.'],
  verify: ['Verify a PC', 'Scan the device QR code or enter its registration details.'],
  history: ['Verification history', 'A timestamped record of your gate checks.'],
  alerts: ['Alerts', 'Devices that need attention at the gate.'],
  users: ['Manage users', 'Student, gate-officer, and administrator accounts and access roles.'],
  logs: ['Verification logs', 'Campus-wide activity recorded by gate officers.'],
  reports: ['Reports', 'A live summary of device registrations and checks.'],
  settings: ['Settings', 'Manage your SmartGate preferences and account.'],
  support: ['Help & support', 'Find help for your SmartGate tasks or contact support.'],
  profile: ['User profile', 'Your SmartGate account details and profile photo.'],
  'device-detail': ['Device QR code', 'A scannable registration token for this computer.'],
}

function readSession() {
  try {
    const token = sessionStorage.getItem('smartgate:token')
    const user = JSON.parse(sessionStorage.getItem('smartgate:user') || 'null')
    const serverTime = sessionStorage.getItem('smartgate:server-time')
    return token && user ? { token, user, serverTime } : null
  } catch {
    return null
  }
}

function readNotificationIdsFor(userEmail) {
  if (!userEmail) return new Set()
  try {
    const ids = JSON.parse(sessionStorage.getItem(`smartgate:notifications-read:${userEmail}`) || '[]')
    return new Set(Array.isArray(ids) ? ids.map(String) : [])
  } catch {
    return new Set()
  }
}

function readNotificationBadgePreference() {
  try {
    return window.localStorage.getItem('smartgate:notification-badge') !== 'false'
  } catch {
    return true
  }
}

function profilePhotoKey(email) {
  return `smartgate:profile-photo:${email}`
}

function readProfilePhoto(email) {
  if (!email) return ''
  try {
    return window.localStorage.getItem(profilePhotoKey(email)) || ''
  } catch {
    return ''
  }
}

async function resizeProfilePhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}

function landingView(role) {
  return { student: 'overview', gate_officer: 'verify', administrator: 'users' }[role] || 'verify'
}

function routeFromLocation(role) {
  const allowedViews = {
    student: ['overview', 'register', 'devices', 'status', 'settings', 'support', 'profile', 'device-detail'],
    gate_officer: ['verify', 'history', 'alerts', 'settings', 'support', 'profile'],
    administrator: ['users', 'devices', 'logs', 'reports', 'settings', 'support', 'profile', 'device-detail'],
  }[role] || []
  const [hashView, encodedDeviceId] = window.location.hash.replace(/^#\/?/, '').split('/')
  const requestedView = role === 'administrator' && hashView === 'students' ? 'users' : hashView
  const view = allowedViews.includes(requestedView) ? requestedView : landingView(role)
  let deviceId = null
  try {
    deviceId = encodedDeviceId ? decodeURIComponent(encodedDeviceId) : null
  } catch {
    deviceId = null
  }
  if (view === 'device-detail' && !deviceId) return { view: landingView(role), deviceId: null }
  return { view, deviceId }
}

function hashForView(view, deviceId) {
  return `#/${view}${deviceId ? `/${encodeURIComponent(deviceId)}` : ''}`
}

function App() {
  const [session, setSession] = useState(readSession)
  const role = session?.user.role === 'student' ? 'Student' : session?.user.role === 'gate_officer' ? 'Gate officer' : session?.user.role === 'administrator' ? 'Administrator' : null
  const [activeView, setActiveView] = useState(() => routeFromLocation(readSession()?.user?.role).view)
  const [devices, setDevices] = useState([])
  const [search, setSearch] = useState('')
  const [logs, setLogs] = useState([])
  const [students, setStudents] = useState([])
  const [users, setUsers] = useState([])
  const [report, setReport] = useState(null)
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [lookup, setLookup] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profilePhoto, setProfilePhoto] = useState(() => readProfilePhoto(readSession()?.user?.email))
  const [readNotificationIds, setReadNotificationIds] = useState(() => readNotificationIdsFor(readSession()?.user?.email))
  const [notificationBadgeEnabled, setNotificationBadgeEnabled] = useState(readNotificationBadgePreference)
  const [notice, setNotice] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const qrCanvasRef = useRef(null)
  const downloadLinkRef = useRef(null)
  const notificationsRef = useRef(null)
  const profileMenuRef = useRef(null)
  const profile = role ? { ...roleConfig[role], name: session.user.name, initials: session.user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() } : null
  const token = session?.token
  const title = activeView === 'devices' && role === 'Administrator'
    ? ['Manage PCs', 'All registered PCs and their current approval status.']
    : viewTitles[activeView]

  useEffect(() => {
    if (!token || !role) return undefined
    let cancelled = false
    const loadData = async () => {
      try {
        const identity = await apiRequest('/auth/me', { token })
        const serverTime = identity.serverTime
        if (!cancelled && serverTime) {
          sessionStorage.setItem('smartgate:server-time', serverTime)
          setSession((current) => current ? { ...current, serverTime } : current)
        }
        if (role === 'Student') {
          const [deviceResponse, logResponse] = await Promise.all([
            apiRequest('/devices', { token }),
            apiRequest('/my-verifications', { token }),
          ])
          if (!cancelled) {
            setDevices(deviceResponse.data)
            setLogs(logResponse.data)
          }
        } else if (role === 'Gate officer') {
          const response = await apiRequest('/verification-logs', { token })
          if (!cancelled) setLogs(response.data)
        } else {
          const [deviceResponse, studentResponse, userResponse, logResponse, reportResponse] = await Promise.all([
            apiRequest('/devices', { token }),
            apiRequest('/admin/students', { token }),
            apiRequest('/admin/users', { token }),
            apiRequest('/admin/logs', { token }),
            apiRequest('/admin/reports', { token }),
          ])
          if (!cancelled) {
            setDevices(deviceResponse.data)
            setStudents(studentResponse.data.map((student) => ({ ...student, studentId: student.student_id, student: student.name, email: student.email, deviceCount: student.computers_count })))
            setUsers(userResponse.data.map((user) => ({ ...user, studentId: user.student_id, deviceCount: user.computers_count ?? 0 })))
            setLogs(logResponse.data)
            setReport(reportResponse)
          }
        }
      } catch (error) {
        if (!cancelled) {
          if (error.status === 401) {
            sessionStorage.removeItem('smartgate:token')
            sessionStorage.removeItem('smartgate:user')
            sessionStorage.removeItem('smartgate:server-time')
            setSession(null)
          } else setNotice(error.message)
        }
      }
    }
    loadData()
    return () => { cancelled = true }
  }, [role, token])

  useEffect(() => {
    if (!session?.user?.role) return undefined
    const syncViewFromLocation = () => {
      const route = routeFromLocation(session.user.role)
      const expectedHash = hashForView(route.view, route.deviceId)
      if (window.location.hash !== expectedHash) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${expectedHash}`)
      }
      setActiveView(route.view)
      setSelectedDevice(route.view === 'device-detail' ? devices.find((device) => String(device.id) === route.deviceId) || null : null)
    }
    syncViewFromLocation()
    window.addEventListener('hashchange', syncViewFromLocation)
    window.addEventListener('popstate', syncViewFromLocation)
    return () => {
      window.removeEventListener('hashchange', syncViewFromLocation)
      window.removeEventListener('popstate', syncViewFromLocation)
    }
  }, [session?.user?.role, devices])

  useEffect(() => {
    if (!scannerOpen) return undefined
    let scanner
    let disposed = false
    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (disposed) return
      scanner = new Html5QrcodeScanner('smartgate-reader', { fps: 8, qrbox: { width: 220, height: 220 } }, false)
      scanner.render((decodedText) => {
        setLookup(decodedText)
        setScannerOpen(false)
        window.setTimeout(() => scanner?.clear().catch(() => {}), 0)
      }, () => {})
    })
    return () => {
      disposed = true
      scanner?.clear().catch(() => {})
    }
  }, [scannerOpen])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!notificationsOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!notificationsRef.current?.contains(event.target)) setNotificationsOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setNotificationsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [notificationsOpen])

  useEffect(() => {
    if (!profileMenuOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setProfileMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileMenuOpen])

  const visibleDevices = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return devices
    return devices.filter((device) => `${device.student} ${device.brand} ${device.model} ${device.serial} ${device.studentId}`.toLowerCase().includes(normalizedSearch))
  }, [devices, search])

  const navigate = (view, deviceId) => {
    const nextHash = hashForView(view, deviceId)
    if (window.location.hash !== nextHash) {
      const nextUrl = new URL(window.location.href)
      nextUrl.hash = nextHash
      window.history.pushState(null, '', nextUrl)
    }
    setActiveView(view)
    setMobileNavOpen(false)
    setSearch('')
    if (view !== 'device-detail') setSelectedDevice(null)
  }

  const signIn = async (email, password) => {
    setLoginBusy(true)
    setLoginError('')
    try {
      const response = await apiRequest('/auth/login', { method: 'POST', body: { email, password } })
      const nextSession = { token: response.token, user: response.user, serverTime: response.serverTime }
      sessionStorage.setItem('smartgate:token', nextSession.token)
      sessionStorage.setItem('smartgate:user', JSON.stringify(nextSession.user))
      sessionStorage.setItem('smartgate:server-time', nextSession.serverTime)
      setReadNotificationIds(readNotificationIdsFor(nextSession.user.email))
      setProfilePhoto(readProfilePhoto(nextSession.user.email))
      const initialView = landingView(nextSession.user.role)
      const loginUrl = new URL(window.location.href)
      loginUrl.hash = hashForView(initialView)
      window.history.replaceState(null, '', loginUrl)
      setActiveView(initialView)
      setSession(nextSession)
    } catch (error) {
      setLoginError(error.errors?.email?.[0] || error.message)
    } finally {
      setLoginBusy(false)
    }
  }

  const signOut = async () => {
    try {
      if (session?.token) await apiRequest('/auth/logout', { token: session.token, method: 'DELETE' })
    } catch {
      // Clear the local session even if the server is unreachable.
    }
    sessionStorage.removeItem('smartgate:token')
    sessionStorage.removeItem('smartgate:user')
    sessionStorage.removeItem('smartgate:server-time')
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    setSession(null)
    setNotificationsOpen(false)
    setProfileMenuOpen(false)
    setProfilePhoto('')
    setReadNotificationIds(new Set())
    setDevices([])
    setLogs([])
    setStudents([])
    setUsers([])
    setReport(null)
  }

  const registerDevice = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const serial = String(data.get('serial')).trim().toUpperCase()
    try {
      const response = await apiRequest('/devices', {
        token: session.token,
        method: 'POST',
        body: { manufacturer: String(data.get('brand')), model: String(data.get('model')).trim(), serial_number: serial },
      })
      const device = response.data
      setDevices((current) => [device, ...current])
      setSelectedDevice(device)
      setNotice('PC registered. Your QR code is ready to download.')
      navigate('device-detail', device.id)
      form.reset()
    } catch (error) {
      setNotice(error.errors?.serial_number?.[0] || error.message)
    }
  }

  const verifyDevice = async (event) => {
    event.preventDefault()
    if (!lookup.trim()) return
    try {
      const response = await apiRequest('/gate/verify', { token: session.token, method: 'POST', body: { identifier: lookup.trim() } })
      const labels = { verified: 'Verified', pending_review: 'Pending review', rejected: 'Rejected', not_registered: 'Not registered' }
      setLookupResult({
        result: labels[response.status] || 'Not registered',
        serial: response.device?.serial || lookup.trim().toUpperCase(),
        student: response.device?.student || 'Unknown device',
        model: response.device ? `${response.device.brand} ${response.device.model}` : 'No matching registration',
      })
      const logResponse = await apiRequest('/verification-logs', { token: session.token })
      setLogs(logResponse.data)
    } catch (error) {
      setNotice(error.message)
    }
  }

  const updateDeviceStatus = async (device, status) => {
    try {
      const response = await apiRequest(`/admin/devices/${device.id}/status`, {
        token: session.token,
        method: 'PATCH',
        body: { status },
      })
      setDevices((current) => current.map((item) => item.id === device.id ? response.data : item))
      setNotice(`Device ${status === 'verified' ? 'approved' : 'updated'}.`)
    } catch (error) {
      setNotice(error.message)
    }
  }

  const updateDevice = async (device, changes) => {
    try {
      const response = await apiRequest(`/admin/devices/${device.id}`, {
        token: session.token,
        method: 'PATCH',
        body: changes,
      })
      setDevices((current) => current.map((item) => item.id === device.id ? response.data : item))
      setNotice('PC record updated.')
      return true
    } catch (error) {
      setNotice(error.errors?.serial_number?.[0] || error.message)
      return false
    }
  }

  const deleteDevice = async (device) => {
    try {
      await apiRequest(`/admin/devices/${device.id}`, { token: session.token, method: 'DELETE' })
      setDevices((current) => current.filter((item) => item.id !== device.id))
      setReport((current) => current ? {
        ...current,
        registeredPcs: Math.max(0, current.registeredPcs - 1),
        verifiedPcs: device.status === 'Verified' ? Math.max(0, current.verifiedPcs - 1) : current.verifiedPcs,
        pendingPcs: device.status === 'Pending review' ? Math.max(0, current.pendingPcs - 1) : current.pendingPcs,
      } : current)
      setNotice('PC record deleted. Its verification history was kept.')
      return true
    } catch (error) {
      setNotice(error.message)
      return false
    }
  }

  const createUser = async (user) => {
    try {
      const response = await apiRequest('/admin/users', {
        token: session.token,
        method: 'POST',
        body: user,
      })
      const createdUser = { ...response.data, studentId: response.data.student_id, deviceCount: 0 }
      setUsers((current) => [createdUser, ...current])
      if (createdUser.role === 'student') {
        setStudents((current) => [{ ...createdUser, student: createdUser.name, deviceCount: 0 }, ...current])
      }
      setNotice('User account created.')
      return true
    } catch (error) {
      setNotice(error.errors?.email?.[0] || error.errors?.student_id?.[0] || error.errors?.password?.[0] || error.message)
      return false
    }
  }

  const updateUser = async (user, changes) => {
    try {
      const response = await apiRequest(`/admin/users/${user.id}`, {
        token: session.token,
        method: 'PATCH',
        body: changes,
      })
      const updatedUser = { ...response.data, studentId: response.data.student_id, deviceCount: response.data.computers_count ?? user.deviceCount ?? 0 }
      setUsers((current) => current.map((item) => item.id === user.id ? updatedUser : item))
      setStudents((current) => {
        const withoutUpdatedUser = current.filter((item) => item.id !== user.id)
        return updatedUser.role === 'student'
          ? [{ ...updatedUser, student: updatedUser.name }, ...withoutUpdatedUser]
          : withoutUpdatedUser
      })
      if (session.user.id === user.id) {
        const nextSession = { ...session, user: updatedUser }
        sessionStorage.setItem('smartgate:user', JSON.stringify(updatedUser))
        setSession(nextSession)
      }
      setNotice('User record updated.')
      return true
    } catch (error) {
      setNotice(error.errors?.email?.[0] || error.errors?.student_id?.[0] || error.message)
      return false
    }
  }

  const deleteUser = async (user) => {
    try {
      await apiRequest(`/admin/users/${user.id}`, { token: session.token, method: 'DELETE' })
      setUsers((current) => current.filter((item) => item.id !== user.id))
      setStudents((current) => current.filter((item) => item.id !== user.id))
      setDevices((current) => current.filter((item) => item.email !== user.email))
      setLogs((current) => current.filter((item) => item.officer !== user.name))
      setReport((current) => current && user.role === 'student' ? {
        ...current,
        studentsCovered: Math.max(0, current.studentsCovered - (user.deviceCount > 0 ? 1 : 0)),
      } : current)
      setNotice(`User deleted. Related PCs and activity are subject to account deletion rules.`)
      return true
    } catch (error) {
      setNotice(error.message)
      return false
    }
  }

  const downloadQr = () => {
    const canvas = qrCanvasRef.current?.querySelector('canvas')
    const link = downloadLinkRef.current
    if (!canvas || !selectedDevice || !link) return
    link.download = `${selectedDevice.id}-smartgate-qr.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const openQr = (device) => {
    setSelectedDevice(device)
    navigate('device-detail', device.id)
  }

  const unresolvedCount = logs.filter((log) => log.result === 'Not registered').length
  const notifications = role === 'Student'
    ? devices.filter((device) => device.status !== 'Verified').map((device) => ({
      id: `${device.id}:${device.status}`,
      title: device.status === 'Rejected' ? 'Registration needs attention' : 'Device awaiting review',
      detail: `${device.brand} ${device.model} · ${device.status}`,
      view: 'status',
    }))
    : role === 'Gate officer'
      ? logs.filter((log) => log.result !== 'Verified').slice(0, 5).map((log) => ({
        id: `${log.id}:${log.result}`,
        title: log.result === 'Not registered' ? 'Unregistered PC attempt' : 'Device needs review',
        detail: `${log.serial} · ${log.time}`,
        view: 'alerts',
      }))
      : [
        ...devices.filter((device) => device.status !== 'Verified').map((device) => ({
          id: `device-${device.id}:${device.status}`,
          title: 'PC registration needs review',
          detail: `${device.student} · ${device.brand} ${device.model}`,
          view: 'devices',
        })),
        ...logs.filter((log) => log.result !== 'Verified').map((log) => ({
          id: `log-${log.id}:${log.result}`,
          title: log.result === 'Not registered' ? 'Unregistered PC attempt' : 'Device needs review',
          detail: `${log.serial} · ${log.time}`,
          view: 'logs',
        })),
      ].slice(0, 5)
  const unreadNotificationCount = notifications.filter((notification) => !readNotificationIds.has(String(notification.id))).length
  const markNotificationsRead = (items) => {
    const nextReadIds = new Set(readNotificationIds)
    items.forEach((notification) => nextReadIds.add(String(notification.id)))
    setReadNotificationIds(nextReadIds)
    try {
      sessionStorage.setItem(`smartgate:notifications-read:${session.user.email}`, JSON.stringify([...nextReadIds]))
    } catch {
      // Keep read state for the current session if storage is unavailable.
    }
  }
  const updateNotificationBadgePreference = (enabled) => {
    setNotificationBadgeEnabled(enabled)
    try {
      window.localStorage.setItem('smartgate:notification-badge', String(enabled))
    } catch {
      setNotice('Preference applies until this page is closed.')
    }
  }
  const changeProfilePhoto = async (file) => {
    if (!file) return
    try {
      const photo = await resizeProfilePhoto(file)
      window.localStorage.setItem(profilePhotoKey(session.user.email), photo)
      setProfilePhoto(photo)
      setNotice('Profile photo updated.')
    } catch (error) {
      setNotice(error.name === 'QuotaExceededError' ? 'Could not save the photo in this browser.' : error.message || 'Could not read this image.')
    }
  }
  const removeProfilePhoto = () => {
    try {
      window.localStorage.removeItem(profilePhotoKey(session.user.email))
      setProfilePhoto('')
      setNotice('Profile photo removed.')
    } catch {
      setNotice('Could not remove the profile photo from this browser.')
    }
  }
  const updateProfile = async (changes) => {
    const previousEmail = session.user.email
    let photoMoveFailed = false
    try {
      const response = await apiRequest('/auth/profile', {
        token: session.token,
        method: 'PATCH',
        body: changes,
      })
      const updatedUser = response.user
      if (previousEmail !== updatedUser.email && profilePhoto) {
        try {
          window.localStorage.setItem(profilePhotoKey(updatedUser.email), profilePhoto)
          window.localStorage.removeItem(profilePhotoKey(previousEmail))
        } catch {
          photoMoveFailed = true
        }
      }
      const nextSession = { ...session, user: updatedUser, serverTime: response.serverTime || session.serverTime }
      sessionStorage.setItem('smartgate:user', JSON.stringify(updatedUser))
      if (nextSession.serverTime) sessionStorage.setItem('smartgate:server-time', nextSession.serverTime)
      setSession(nextSession)
      setUsers((current) => current.map((user) => user.id === updatedUser.id ? { ...user, ...updatedUser, studentId: updatedUser.student_id, deviceCount: user.deviceCount } : user))
      setStudents((current) => current.map((user) => user.id === updatedUser.id ? { ...user, ...updatedUser, student: updatedUser.name, studentId: updatedUser.student_id } : user))
      setNotice(photoMoveFailed ? 'Profile updated, but its photo could not be moved to the new email.' : 'Profile updated.')
      return true
    } catch (error) {
      setNotice(error.errors?.email?.[0] || error.errors?.student_id?.[0] || error.errors?.password?.[0] || error.message)
      return false
    }
  }
  const todayCount = report?.checksToday ?? logs.filter((log) => isToday(log.checkedAt, session?.serverTime)).length
  const studentCount = report?.studentsCovered ?? (Array.isArray(students) ? students.length : 0)

  if (!session || !profile) return <LoginView onSubmit={signIn} error={loginError} busy={loginBusy} />

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><ShieldCheck size={21} strokeWidth={2.2} /></div>
          <div className="brand-copy"><strong>SmartGate</strong></div>
          <button className="icon-button mobile-close" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}><X size={19} /></button>
        </div>
        <div className="nav-stack">
          {profile.nav.map((group) => <div className="nav-group" key={group.label}>
            <span className="nav-label">{group.label}</span>
            {group.items.map(({ id, label, icon: Icon, badge }) => <button key={id} className={`nav-item ${activeView === id ? 'nav-item-active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={17} strokeWidth={1.9} /><span>{label}</span>{badge && unresolvedCount > 0 && <i className="nav-badge">{unresolvedCount}</i>}
            </button>)}
          </div>)}
          {role === 'Student' && <div className="sidebar-tip"><span className="tip-icon"><ShieldCheck size={15} /></span><div><strong>Campus ready</strong><span>Keep your QR handy at the gate.</span></div></div>}
        </div>
        <div className="sidebar-bottom">
          <button className={`nav-item subtle-nav ${activeView === 'settings' ? 'nav-item-active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={17} /><span>Settings</span></button>
          <button className={`nav-item subtle-nav ${activeView === 'support' ? 'nav-item-active' : ''}`} onClick={() => navigate('support')}><CircleHelp size={17} /><span>Help & support</span></button>
          <div className="profile-row"><UserAvatar profile={profile} photo={profilePhoto} /><div className="profile-copy"><strong>{profile.name}</strong><span>{profile.subtitle}</span></div><button className="icon-button logout" title="Sign out" onClick={signOut}><LogOut size={16} /></button></div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>SmartGate</span><span className="breadcrumb-slash">/</span><strong>{title[0]}</strong></div>
          <div className="topbar-actions">
            <div className="notification-wrap" ref={notificationsRef}>
              <button className="icon-button notification-button" aria-label={unreadNotificationCount ? `${unreadNotificationCount} new notifications` : 'Notifications'} aria-expanded={notificationsOpen} aria-haspopup="dialog" onClick={() => { const opening = !notificationsOpen; if (opening) markNotificationsRead(notifications); setNotificationsOpen(opening) }}><Bell size={18} />{notificationBadgeEnabled && unreadNotificationCount > 0 && <i />}</button>
              {notificationsOpen && <section className="notification-menu" role="dialog" aria-label="Notifications">
                <div className="notification-menu-heading"><strong>Notifications</strong><span>{notifications.length} to review</span></div>
                {notifications.length ? <div className="notification-list">{notifications.map((notification) => <button className="notification-item" key={notification.id} onClick={() => { setNotificationsOpen(false); navigate(notification.view) }}><span className="notification-indicator" /><span className="notification-copy"><strong>{notification.title}</strong><small>{notification.detail}</small></span><ArrowUpRight size={15} /></button>)}</div> : <p className="notification-empty">You’re all caught up.</p>}
              </section>}
            </div>
            <div className="profile-menu-wrap" ref={profileMenuRef}>
              <button className="profile-menu-trigger" aria-label="Open profile menu" aria-expanded={profileMenuOpen} aria-haspopup="menu" onClick={() => setProfileMenuOpen((open) => !open)}><UserAvatar profile={profile} photo={profilePhoto} className="top-avatar" /></button>
              {profileMenuOpen && <div className="profile-menu" role="menu" aria-label="User profile menu">
                <div className="profile-menu-identity"><UserAvatar profile={profile} photo={profilePhoto} /><span><strong>{profile.name}</strong><small>{session.user.email}</small></span></div>
                <button role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); navigate('profile') }}><UserRound size={16} /> View profile</button>
              </div>}
            </div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>{activeView === 'device-detail' && <button className="back-link" onClick={() => navigate(role === 'Student' ? 'devices' : 'devices')}><ArrowLeft size={15} /> Back to devices</button>}<div className="eyebrow">{role === 'Gate officer' ? 'GATE OPERATIONS' : role === 'Administrator' ? 'CAMPUS MANAGEMENT' : 'STUDENT PORTAL'}</div><h1>{title[0]}</h1><p>{title[1]}</p></div>
            {role === 'Student' && activeView !== 'register' && activeView !== 'device-detail' && <button className="button button-primary" onClick={() => navigate('register')}><Plus size={17} /> Register PC</button>}
            {role === 'Administrator' && activeView === 'reports' && <button className="button button-secondary" onClick={() => setNotice('Report export is available in the connected backend.')}><ArrowDownToLine size={16} /> Export report</button>}
          </div>

          {activeView === 'overview' && <Overview role={role} userName={profile.name} asOf={session.serverTime} devices={devices} logs={logs} todayCount={todayCount} navigate={navigate} openQr={openQr} />}
          {activeView === 'register' && <RegistrationForm onSubmit={registerDevice} onCancel={() => navigate('devices')} />}
          {activeView === 'device-detail' && selectedDevice && <DeviceDetail device={selectedDevice} canvasRef={qrCanvasRef} downloadLinkRef={downloadLinkRef} onDownload={downloadQr} />}
          {activeView === 'devices' && <DevicesView devices={visibleDevices} role={role} users={users} search={search} setSearch={setSearch} openQr={openQr} onUpdateStatus={updateDeviceStatus} onEditDevice={updateDevice} onDeleteDevice={deleteDevice} />}
          {activeView === 'status' && <StatusView devices={devices} openQr={openQr} navigate={navigate} />}
          {activeView === 'verify' && <VerifyView lookup={lookup} setLookup={setLookup} onVerify={verifyDevice} result={lookupResult} scannerOpen={scannerOpen} setScannerOpen={setScannerOpen} logs={logs} todayCount={todayCount} asOf={session.serverTime} />}
          {activeView === 'history' && <LogsView logs={logs.filter((log) => log.officer === profile.name)} />}
          {activeView === 'alerts' && <AlertsView logs={logs.filter((log) => log.result !== 'Verified')} navigate={() => navigate('verify')} />}
          {activeView === 'logs' && <LogsView logs={logs} />}
          {activeView === 'users' && <UsersView users={users} currentUserId={session.user.id} onCreateUser={createUser} onUpdateUser={updateUser} onDeleteUser={deleteUser} />}
          {activeView === 'reports' && <ReportsView devices={devices} students={studentCount} todayCount={todayCount} report={report} asOf={session.serverTime} />}
          {activeView === 'settings' && <SettingsView session={session} role={role} notificationBadgeEnabled={notificationBadgeEnabled} onNotificationBadgeChange={updateNotificationBadgePreference} onSignOut={signOut} />}
          {activeView === 'support' && <SupportView role={role} navigate={navigate} />}
          {activeView === 'profile' && <ProfileView session={session} role={role} profile={profile} photo={profilePhoto} onPhotoChange={changeProfilePhoto} onPhotoRemove={removeProfilePhoto} onSave={updateProfile} />}
        </div>
        <footer className="footer"><span>© 2026 SmartGate PC Verification. All Rights Reserved.</span></footer>
      </main>
      {notice && <div className="toast" role="status"><BadgeCheck size={17} />{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={15} /></button></div>}
    </div>
  )
}

function UserAvatar({ profile, photo, className = '' }) {
  return <div className={`avatar ${className}`} role="img" aria-label={`${profile.name} profile photo`} title={profile.name}>{photo ? <img src={photo} alt="" /> : profile.initials}</div>
}

function DirectoryUserAvatar({ user }) {
  const profile = {
    name: user.name,
    initials: String(user.name || '?').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase(),
  }
  return <UserAvatar profile={profile} photo={readProfilePhoto(user.email)} className="student-avatar" />
}

function LoginView({ onSubmit, error, busy }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const demoPassword = 'RpCollege-Demo-2026!'
  const demoAccounts = [
    ['Student', 'alice@smartgate.test'],
    ['Gate officer', 'emmanuel@smartgate.test'],
    ['Administrator', 'diane@smartgate.test'],
  ]

  const submit = (event) => {
    event.preventDefault()
    onSubmit(email.trim(), password)
  }

  return <main className="auth-shell">
    <section className="auth-main"><div className="auth-card"><span className="eyebrow">WELCOME BACK</span><h2>Sign in to SmartGate</h2><p className="auth-subtitle">Use your RP College account to continue.</p>
      <form onSubmit={submit} className="auth-form"><label className="field"><span>College email</span><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@rp.ac.rw" /></label><label className="field"><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></label>{error && <div className="auth-error" role="alert">{error}</div>}<button type="submit" disabled={busy} className="button button-primary auth-submit">{busy ? 'Signing in...' : 'Sign in'}<ArrowUpRight size={16} /></button></form>
      {import.meta.env.DEV && <div className="demo-access"><div className="demo-heading"><span>LOCAL DEMO ACCOUNTS</span><span>Development only</span></div><div className="demo-account-list">{demoAccounts.map(([label, account]) => <button type="button" key={account} onClick={() => { setEmail(account); setPassword(demoPassword) }}><span className="demo-account-icon">{label === 'Student' ? <Users size={14} /> : label === 'Gate officer' ? <ScanLine size={14} /> : <Settings2 size={14} />}</span><span><strong>{label}</strong><small>{account}</small></span><ArrowUpRight size={14} /></button>)}</div></div>}
    </div></section>
  </main>
}

function Overview({ role, userName, devices, logs, todayCount, navigate, openQr }) {
  const isStudent = role === 'Student'
  const [currentTime, setCurrentTime] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const currentHour = currentTime.getHours()
  const greeting = currentHour >= 5 && currentHour < 12 ? 'Good morning' : currentHour < 18 && currentHour >= 12 ? 'Good afternoon' : 'Good evening'
  const greetingName = isStudent ? userName.split(' ')[0] : userName
  const verifiedToday = logs.filter((log) => isToday(log.checkedAt) && log.result === 'Verified').length
  const flaggedToday = logs.filter((log) => isToday(log.checkedAt) && log.result !== 'Verified').length
  const pendingDevices = devices.filter((device) => device.status !== 'Verified')
  const verifiedDevices = devices.length - pendingDevices.length
  const recentLogs = isStudent ? logs.slice(0, 3) : logs.slice(0, 4)
  return <>
    <section className="welcome-strip"><div><span className="welcome-kicker">{currentTime.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()}</span><h2>{greeting}, {greetingName}</h2><p>{isStudent ? 'Your devices and campus checks, all in one place.' : 'Your gate is active. Here is today’s verification activity.'}</p></div><div className="welcome-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-shield"><ShieldCheck size={36} /></div><div className="art-dot dot-one" /><div className="art-dot dot-two" /></div></section>
    <div className="metric-grid">
      {isStudent ? <Metric label="Registered devices" value={devices.length} note="Linked to your student ID" icon={Computer} color="mint" /> : <Metric label="Checks today" value={todayCount} note="Recorded under your officer account" icon={ClipboardCheck} color="mint" />}
      {isStudent ? <Metric label="Gate verifications" value={logs.length} note="For your registered devices" icon={ClipboardCheck} color="yellow" /> : <Metric label="Verified today" value={verifiedToday} note="Approved device entries" icon={BadgeCheck} color="yellow" />}
      {isStudent ? <Metric label="Needs attention" value={pendingDevices.length} note="Pending or rejected registrations" icon={AlertTriangle} color="peach" /> : <Metric label="Flagged today" value={flaggedToday} note="Unregistered or unresolved checks" icon={AlertTriangle} color="peach" />}
      {isStudent ? <Metric label="Approved devices" value={verifiedDevices} note={`Of ${devices.length} registered`} icon={Activity} color="lilac" /> : <Metric label="Verification rate" value={todayCount ? `${Math.round((verifiedToday / todayCount) * 100)}%` : '—'} note="Based on today's checks" icon={Activity} color="lilac" />}
    </div>
    <div className="overview-grid">
      <section className="content-panel recent-panel"><div className="panel-heading"><div><h3>{isStudent ? 'My devices' : 'Recent verifications'}</h3><p>{isStudent ? 'Your registered computers' : 'Latest activity at the gate'}</p></div><button className="text-button" onClick={() => navigate(isStudent ? 'devices' : isAdmin ? 'logs' : 'history')}>View all <ArrowUpRight size={15} /></button></div>
        {isStudent ? <DeviceTable devices={devices.slice(0, 3)} role={role} openQr={openQr} /> : <LogTable logs={recentLogs} compact />}
      </section>
      <section className="content-panel readiness-panel"><div className="panel-heading"><div><h3>{isStudent ? 'Registration health' : 'Gate status'}</h3><p>{isStudent ? 'Keep your records up to date' : 'Live overview · Kigali campus'}</p></div><span className="status-pill status-verified"><span />Active</span></div>
        {isStudent ? <><div className="readiness-score"><div className="score-ring"><span>{verifiedDevices}/{devices.length}</span></div><div><strong>{pendingDevices.length ? 'Registration in progress' : 'Campus-ready'}</strong><p>{pendingDevices.length ? `${pendingDevices.length} device${pendingDevices.length === 1 ? '' : 's'} need review.` : 'All registered devices are approved.'}</p></div></div><div className="check-list">{devices.slice(0, 3).map((device) => <div key={device.id}><span className={device.status === 'Verified' ? 'check-mark' : 'check-pending'}>{device.status === 'Verified' ? <BadgeCheck size={14} /> : <Clock3 size={14} />}</span><span>{device.brand} {device.model}</span><strong className={device.status === 'Verified' ? '' : 'pending-text'}>{device.status === 'Verified' ? 'Verified' : 'In review'}</strong></div>)}</div><button className="button button-secondary full-button" onClick={() => navigate('status')}>View registration status <ArrowUpRight size={15} /></button></> : <><div className="gate-status-card"><div className="gate-pulse"><ScanLine size={21} /></div><div><strong>North entrance</strong><span>Officer station · Gate 01</span></div><span className="live-label"><i />LIVE</span></div><div className="gate-stats"><div><span>Verified today</span><strong>{verifiedToday}</strong></div><div><span>Flagged today</span><strong className="flag-number">{flaggedToday}</strong></div></div><button className="button button-primary full-button" onClick={() => navigate('verify')}><ScanLine size={16} /> Start verification</button></>}
      </section>
    </div>
    <section className="trust-line"><ShieldCheck size={16} /><span>{isStudent ? 'Your device data is protected and visible only to authorized campus staff.' : 'Every verification is securely recorded with the responsible officer.'}</span><button className="icon-button" title="Learn about security"><CircleHelp size={15} /></button></section>
  </>
}

function Metric({ label, value, note, icon: Icon, color }) {
  return <article className="metric-card"><div className={`metric-icon metric-${color}`}><Icon size={18} strokeWidth={2} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></article>
}

function RegistrationForm({ onSubmit, onCancel }) {
  return <section className="form-layout"><form className="content-panel registration-form" onSubmit={onSubmit}>
    <div className="form-section-heading"><div className="form-icon"><Computer size={19} /></div><div><h3>Computer details</h3><p>Enter the information exactly as it appears on your device.</p></div></div>
    <div className="form-grid"><label className="field"><span>Manufacturer <b>*</b></span><select name="brand" required defaultValue=""><option value="" disabled>Select manufacturer</option><option>HP</option><option>Dell</option><option>Lenovo</option><option>Apple</option><option>Acer</option><option>ASUS</option><option>Other</option></select></label><label className="field"><span>Model name <b>*</b></span><input name="model" required placeholder="e.g. ThinkPad T14 Gen 3" /></label><label className="field field-wide"><span>Manufacturer serial number <b>*</b></span><input name="serial" required minLength="5" maxLength="40" placeholder="Enter the serial number printed on your PC" /><small>Usually found on a label on the underside of your laptop or in BIOS settings.</small></label></div>
    <div className="form-note"><ShieldCheck size={17} /><span><strong>Your serial number stays protected.</strong> It is used to identify this device during campus checks.</span></div>
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button className="button button-primary" type="submit"><Plus size={16} /> Register device</button></div>
  </form><aside className="form-aside"><div className="aside-icon"><QrCode size={22} /></div><h3>Your QR code is created automatically</h3><p>Once submitted, you can download the code and show it at the college entrance.</p><div className="aside-steps"><div><span>01</span><p>Enter your PC details</p></div><div><span>02</span><p>Save your registration</p></div><div><span>03</span><p>Show your QR at the gate</p></div></div></aside></section>
}

function DeviceDetail({ device, canvasRef, downloadLinkRef, onDownload }) {
  return <section className="detail-layout"><article className="content-panel device-summary"><div className="detail-topline"><div className="device-brand-mark"><Computer size={23} /></div><span className={`status-pill ${device.status === 'Verified' ? 'status-verified' : 'status-pending'}`}><span />{device.status}</span></div><div className="device-heading"><span>{device.brand} · {device.id}</span><h2>{device.model}</h2><p>Registered {formatDate(device.registeredAt)}</p></div><div className="detail-fields"><div><span>Manufacturer</span><strong>{device.brand}</strong></div><div><span>Serial number</span><strong className="serial-value">{device.serial}</strong></div><div><span>Student ID</span><strong>{device.studentId}</strong></div><div><span>Registered to</span><strong>{device.student}</strong></div></div><div className="detail-notice"><ShieldCheck size={17} /><span>This QR code is linked to this device registration. Keep it accessible when entering campus.</span></div></article><aside className="content-panel qr-panel"><span className="eyebrow">GATE PASS</span><h3>Device QR code</h3><p>Present this code to a gate officer for verification.</p><div className="qr-frame" ref={canvasRef}><QRCodeCanvas value={device.qrToken} size={188} level="H" includeMargin /></div><div className="qr-token">{device.qrToken}</div><button className="button button-primary full-button" onClick={onDownload}><ArrowDownToLine size={16} /> Download QR code</button><a ref={downloadLinkRef} className="hidden-download" aria-hidden="true" tabIndex={-1} /><span className="qr-privacy"><ShieldCheck size={13} /> Does not expose your serial number</span></aside></section>
}

function DevicesView({ devices, role, users, search, setSearch, openQr, onUpdateStatus, onEditDevice, onDeleteDevice }) {
  return <section className="content-panel table-panel"><div className="table-toolbar"><div><h3>{role === 'Student' ? 'Registered devices' : 'All registered PCs'}</h3><p>{devices.length} {devices.length === 1 ? 'device' : 'devices'} found</p></div><div className="toolbar-actions"><label className="search-field"><Search size={16} /><input placeholder="Search devices..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>{role === 'Administrator' && <button className="icon-button filter-button" title="Filters"><Settings2 size={17} /></button>}</div></div><DeviceTable devices={devices} role={role} users={users} openQr={openQr} onUpdateStatus={onUpdateStatus} onEditDevice={onEditDevice} onDeleteDevice={onDeleteDevice} /></section>
}

function DeviceTable({ devices, role, users = [], openQr, onUpdateStatus, onEditDevice, onDeleteDevice }) {
  const [editingDevice, setEditingDevice] = useState(null)
  const [deletingDevice, setDeletingDevice] = useState(null)
  const isAdmin = role === 'Administrator'

  return <>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>DEVICE</th>{role !== 'Student' && <th>STUDENT</th>}<th>SERIAL NUMBER</th><th>STATUS</th><th>REGISTERED</th><th>ACTIONS</th></tr></thead><tbody>{devices.length ? devices.map((device) => <tr key={device.id}><td><div className="device-cell"><div className="mini-device"><Computer size={16} /></div><div><strong>{device.brand} {device.model}</strong><span>{device.id.slice(0, 8)}</span></div></div></td>{role !== 'Student' && <td><div className="student-cell"><strong>{device.student}</strong><span>{device.studentId}</span></div></td>}<td><span className="serial-value">{device.serial}</span></td><td><span className={`status-pill ${device.status === 'Verified' ? 'status-verified' : 'status-pending'}`}><span />{device.status}</span></td><td>{formatDate(device.registeredAt)}</td><td className="row-actions"><button className="row-action" onClick={() => openQr(device)} title="View QR code" aria-label={`View QR code for ${device.model}`}><QrCode size={16} /></button>{isAdmin && <><button className="row-action" onClick={() => setEditingDevice(device)} title="Edit PC" aria-label={`Edit ${device.model}`}><Pencil size={15} /></button><button className="row-action row-action-danger" onClick={() => setDeletingDevice(device)} title="Delete PC" aria-label={`Delete ${device.model}`}><Trash2 size={15} /></button>{device.status !== 'Verified' && <button className="approve-action" onClick={() => onUpdateStatus(device, 'verified')}><BadgeCheck size={14} /> Approve</button>}</>}</td></tr>) : <tr><td className="empty-cell" colSpan={role === 'Student' ? 5 : 6}>No devices match your search.</td></tr>}</tbody></table></div>
    {editingDevice && <EditDeviceDialog device={editingDevice} users={users} onClose={() => setEditingDevice(null)} onSave={async (changes) => { const saved = await onEditDevice(editingDevice, changes); if (saved) setEditingDevice(null); return saved }} />}
    {deletingDevice && <ConfirmDeleteDialog title="Delete PC record?" message={`Permanently delete ${deletingDevice.brand} ${deletingDevice.model} (${deletingDevice.serial})? Existing verification logs will be kept without this PC record.`} onCancel={() => setDeletingDevice(null)} onConfirm={() => onDeleteDevice(deletingDevice)} />}
  </>
}

function EditDeviceDialog({ device, users, onClose, onSave }) {
  const [saving, setSaving] = useState(false)
  const initialStatus = device.status === 'Verified' ? 'verified' : device.status === 'Rejected' ? 'rejected' : 'pending_review'
  const students = users.filter((user) => user.role === 'student')

  const submit = async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    const saved = await onSave({
      user_id: Number(data.get('user_id')),
      manufacturer: String(data.get('manufacturer')).trim(),
      model: String(data.get('model')).trim(),
      serial_number: String(data.get('serial_number')).trim(),
      status: String(data.get('status')),
    })
    setSaving(false)
    if (saved) onClose()
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form className="record-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-device-title" onSubmit={submit}>
    <div className="record-dialog-heading"><div><h2 id="edit-device-title">Edit PC record</h2><p>Update registration details and review status.</p></div><button type="button" className="icon-button" aria-label="Close edit form" onClick={onClose}><X size={17} /></button></div>
    <div className="record-dialog-fields">
      <label className="field"><span>Registered student <b>*</b></span><select name="user_id" required defaultValue={String(device.ownerId)}>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.student_id}</option>)}</select></label>
      <label className="field"><span>Manufacturer <b>*</b></span><input name="manufacturer" required maxLength="80" defaultValue={device.brand} /></label>
      <label className="field"><span>Model <b>*</b></span><input name="model" required maxLength="120" defaultValue={device.model} /></label>
      <label className="field"><span>Serial number <b>*</b></span><input name="serial_number" required minLength="5" maxLength="120" defaultValue={device.serial} /></label>
      <label className="field"><span>Review status <b>*</b></span><select name="status" defaultValue={initialStatus}><option value="pending_review">Pending review</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label>
    </div>
    <div className="record-dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></div>
  </form></div>
}

function ConfirmDeleteDialog({ title, message, onCancel, onConfirm }) {
  const [deleting, setDeleting] = useState(false)

  const confirm = async () => {
    setDeleting(true)
    const deleted = await onConfirm()
    setDeleting(false)
    if (deleted) onCancel()
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) onCancel() }}><section className="record-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title" aria-describedby="confirm-delete-message">
    <div className="record-dialog-heading"><div><h2 id="confirm-delete-title">{title}</h2><p id="confirm-delete-message">{message}</p></div><button type="button" className="icon-button" aria-label="Cancel deletion" onClick={onCancel} disabled={deleting}><X size={17} /></button></div>
    <div className="record-dialog-actions"><button type="button" className="button button-secondary" onClick={onCancel} disabled={deleting}>Cancel</button><button type="button" className="button button-danger" onClick={confirm} disabled={deleting}><Trash2 size={15} />{deleting ? 'Deleting...' : 'Delete'}</button></div>
  </section></div>
}

function StatusView({ devices, openQr, navigate }) {
  const verified = devices.filter((device) => device.status === 'Verified').length
  return <div className="status-view"><section className="content-panel status-banner"><div className="status-banner-icon"><ShieldCheck size={27} /></div><div><span className="eyebrow">ACCOUNT STATUS</span><h2>{verified === devices.length ? 'Your devices are campus-ready' : 'Registration in progress'}</h2><p>{verified} of {devices.length} devices are approved for entry.</p></div><span className="status-pill status-verified"><span />{verified === devices.length ? 'All clear' : 'In review'}</span></section><div className="status-device-list">{devices.map((device) => <article className="content-panel status-device" key={device.id}><div className="mini-device"><Computer size={18} /></div><div className="status-device-name"><strong>{device.brand} {device.model}</strong><span>Serial {device.serial} · Submitted {formatDate(device.registeredAt)}</span></div><span className={`status-pill ${device.status === 'Verified' ? 'status-verified' : 'status-pending'}`}><span />{device.status}</span>{device.status === 'Verified' && <button className="text-button" onClick={() => openQr(device)}>View QR <ArrowUpRight size={14} /></button>}</article>)}</div>{devices.some((device) => device.status !== 'Verified') && <div className="review-note"><Clock3 size={17} /><span><strong>Review usually takes one business day.</strong> You can use your approved devices while we review the pending registration.</span></div>}<button className="button button-primary" onClick={() => navigate('register')}><Plus size={16} /> Register another PC</button></div>
}

function VerifyView({ lookup, setLookup, onVerify, result, scannerOpen, setScannerOpen, logs, todayCount }) {
  const verifiedToday = logs.filter((log) => isToday(log.checkedAt) && log.result === 'Verified').length
  const weekCounts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - 6 + index)
    return { label: date.toLocaleDateString('en-US', { weekday: 'short' }), count: logs.filter((log) => log.checkedAt && new Date(log.checkedAt).toDateString() === date.toDateString()).length }
  })
  const peakCount = Math.max(1, ...weekCounts.map((day) => day.count))
  return <div className="verify-layout"><section className="content-panel verify-panel"><div className="verify-panel-heading"><div className="scan-emblem"><ScanLine size={22} /></div><div><h3>Scan device QR</h3><p>Position the code inside the scanner frame.</p></div></div><button className="camera-surface" onClick={() => setScannerOpen((open) => !open)}><span className="camera-corners"><i /><i /><i /><i /></span><span className="camera-center"><QrCode size={34} /></span><strong>{scannerOpen ? 'Close camera scanner' : 'Open camera scanner'}</strong><span>{scannerOpen ? 'Stop scanning and enter a code manually instead' : 'Use your webcam or device camera'}</span></button>{scannerOpen && <div id="smartgate-reader" className="qr-reader" />}<div className="or-divider"><span />or enter manually<span /></div><form className="lookup-form" onSubmit={onVerify}><label className="field"><span>Serial number or QR token</span><div className="input-with-button"><input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="e.g. 5CD1418K9P or SG1.…" /><button type="submit" className="button button-primary"><Search size={16} /> Verify</button></div></label></form></section><aside className="verify-aside"><div className="verification-note"><div className="note-icon"><ShieldCheck size={19} /></div><div><strong>Secure verification</strong><p>Device details are checked against the college registration records.</p></div></div><div className="verification-note"><div className="note-icon note-icon-warm"><History size={19} /></div><div><strong>Logged automatically</strong><p>Each check is recorded with your officer account and timestamp.</p></div></div><div className="today-checks"><span>CHECKS TODAY</span><strong>{todayCount} <i>{todayCount ? `${Math.round((verifiedToday / todayCount) * 100)}% verified` : 'No checks yet'}</i></strong><div className="mini-bars">{weekCounts.map((day) => <i key={day.label} title={`${day.label}: ${day.count}`} style={{ height: `${Math.max(8, (day.count / peakCount) * 100)}%` }} />)}</div><small>Based on your logged gate checks</small></div></aside>
    {result && <section className={`content-panel result-panel ${result.result === 'Verified' ? 'result-success' : result.result === 'Pending review' ? 'result-pending' : 'result-fail'}`}><div className="result-icon">{result.result === 'Verified' ? <BadgeCheck size={24} /> : result.result === 'Pending review' ? <Clock3 size={24} /> : <ShieldQuestion size={24} />}</div><div className="result-main"><span className="eyebrow">VERIFICATION RESULT</span><h3>{result.result === 'Verified' ? 'Device verified' : result.result === 'Pending review' ? 'Pending administrator review' : 'Not registered'}</h3><p>{result.student} {result.model && result.model !== 'No matching registration' ? `· ${result.model}` : ''}</p></div><div className="result-serial"><span>SERIAL NUMBER</span><strong>{result.serial}</strong></div><span className={`status-pill ${result.result === 'Verified' ? 'status-verified' : 'status-pending'}`}><span />{result.result}</span></section>}
  </div>
}

function LogsView({ logs }) {
  return <section className="content-panel table-panel"><div className="table-toolbar"><div><h3>Verification activity</h3><p>{logs.length} records · Most recent first</p></div><button className="button button-secondary" onClick={() => window.print()}><ArrowDownToLine size={16} /> Export</button></div><LogTable logs={logs} /></section>
}

function LogTable({ logs, compact = false }) {
  return <div className="table-scroll"><table className="data-table log-table"><thead><tr><th>RESULT</th><th>STUDENT / DEVICE</th><th>SERIAL NUMBER</th><th>OFFICER</th><th>TIME</th></tr></thead><tbody>{logs.slice(0, compact ? 5 : undefined).map((log) => <tr key={log.id}><td><span className={`status-pill ${log.result === 'Verified' ? 'status-verified' : 'status-denied'}`}><span />{log.result}</span></td><td><div className="student-cell"><strong>{log.student}</strong><span>{log.device}</span></div></td><td><span className="serial-value">{log.serial}</span></td><td><div className="officer-cell"><span className="officer-avatar">{log.officer.split(' ').map((part) => part[0]).join('')}</span>{log.officer}</div></td><td>{log.time}</td></tr>)}</tbody></table></div>
}

function AlertsView({ logs, navigate }) {
  return <section className="content-panel alerts-panel"><div className="table-toolbar"><div><h3>Flagged gate activity</h3><p>Unregistered or unresolved device checks</p></div><span className="alert-count"><AlertTriangle size={15} />{logs.length} open</span></div>{logs.length ? logs.map((log) => <article className="alert-row" key={log.id}><div className="alert-icon"><AlertTriangle size={18} /></div><div className="alert-copy"><strong>{log.result === 'Not registered' ? 'Unregistered device attempt' : 'Device pending review'}</strong><span>{log.serial} · {log.officer} · Today at {log.time}</span></div><button className="text-button" onClick={navigate}>Review <ArrowUpRight size={14} /></button></article>) : <div className="empty-state"><div><BadgeCheck size={24} /></div><strong>No active alerts</strong><p>Unresolved verification attempts will appear here.</p></div>}</section>
}

function SettingsView({ session, role, notificationBadgeEnabled, onNotificationBadgeChange, onSignOut }) {
  return <>
    <section className="content-panel settings-panel">
      <div className="settings-section">
        <div className="settings-section-heading"><div><h2>Account</h2><p>Your current SmartGate identity and access role.</p></div><ShieldCheck size={19} /></div>
        <dl className="settings-account-grid">
          <div><dt>Name</dt><dd>{session.user.name}</dd></div>
          <div><dt>Email</dt><dd>{session.user.email}</dd></div>
          <div><dt>Role</dt><dd>{role}</dd></div>
        </dl>
      </div>
      <div className="settings-section">
        <div className="settings-section-heading"><div><h2>Notifications</h2><p>Choose whether new notifications show a red indicator on the bell.</p></div><Bell size={19} /></div>
        <label className="settings-option"><input type="checkbox" checked={notificationBadgeEnabled} onChange={(event) => onNotificationBadgeChange(event.target.checked)} /><span><strong>Show unread notification indicator</strong><small>You can still open and read notifications when this is off.</small></span></label>
      </div>
      <div className="settings-section settings-session-row">
        <div><h2>Secure session</h2><p>Sign out to revoke this browser’s access token.</p></div>
        <button className="button button-secondary" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
      </div>
    </section>
  </>
}

function ProfileView({ session, role, profile, photo, onPhotoChange, onPhotoRemove, onSave }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password')).trim()
    setSaving(true)
    const saved = await onSave({
      name: String(data.get('name')).trim(),
      email: String(data.get('email')).trim(),
      student_id: role === 'Student' ? String(data.get('student_id')).trim() : null,
      password: password || null,
      password_confirmation: password ? String(data.get('password_confirmation')) : null,
    })
    setSaving(false)
    if (saved) setEditing(false)
  }

  return <section className="content-panel profile-panel">
    <div className="profile-summary">
      <UserAvatar profile={profile} photo={photo} className="profile-page-avatar" />
      <div className="profile-summary-copy"><span className="eyebrow">SMARTGATE ACCOUNT</span><h2>{session.user.name}</h2><p>{session.user.email}</p><span className={`user-role-pill user-role-${session.user.role}`}>{role}</span></div>
      <div className="profile-photo-actions">
        {!editing && <button className="button button-secondary" onClick={() => setEditing(true)}><Pencil size={15} /> Edit profile</button>}
        <label className="button button-secondary profile-photo-upload"><Camera size={15} /> Change photo<input type="file" accept="image/*" onChange={(event) => { onPhotoChange(event.target.files?.[0]); event.target.value = '' }} /></label>
        {photo && <button className="text-button" onClick={onPhotoRemove}>Remove photo</button>}
        <small>Photo is saved in this browser for this account.</small>
      </div>
    </div>
    {editing ? <form className="profile-edit-form" onSubmit={submit}>
      <div className="profile-edit-fields">
        <label className="field"><span>Full name <b>*</b></span><input name="name" required maxLength="120" defaultValue={session.user.name} /></label>
        <label className="field"><span>Email address <b>*</b></span><input name="email" type="email" required maxLength="255" defaultValue={session.user.email} /></label>
        {role === 'Student' && <label className="field"><span>Student ID <b>*</b></span><input name="student_id" required maxLength="40" defaultValue={session.user.student_id || ''} /></label>}
        <label className="field"><span>New password</span><input name="password" type="password" minLength="12" autoComplete="new-password" /><small>Leave both password fields blank to keep your current password.</small></label>
        <label className="field"><span>Confirm new password</span><input name="password_confirmation" type="password" minLength="12" autoComplete="new-password" /></label>
      </div>
      <div className="profile-edit-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving...' : 'Save profile'}</button></div>
    </form> : <dl className="profile-details">
      <div><dt>User ID</dt><dd>{session.user.id}</dd></div>
      <div><dt>Full name</dt><dd>{session.user.name}</dd></div>
      <div><dt>Email address</dt><dd>{session.user.email}</dd></div>
      <div><dt>Account role</dt><dd>{role}</dd></div>
      {session.user.student_id && <div><dt>Student ID</dt><dd>{session.user.student_id}</dd></div>}
    </dl>}
  </section>
}

function SupportView({ role, navigate }) {
  const helpItems = role === 'Student'
    ? [
      { title: 'Register a computer', detail: 'Add your computer using its manufacturer serial number.', view: 'register' },
      { title: 'Check registration status', detail: 'See whether a device is pending, approved, or needs attention.', view: 'status' },
      { title: 'View your devices', detail: 'Find your registered computers and their QR codes.', view: 'devices' },
    ]
    : role === 'Gate officer'
      ? [
        { title: 'Verify a computer', detail: 'Scan a QR code or enter a serial number at the gate.', view: 'verify' },
        { title: 'Review flagged checks', detail: 'See unregistered or unresolved device attempts.', view: 'alerts' },
        { title: 'View verification history', detail: 'Review checks recorded under your account.', view: 'history' },
      ]
      : [
        { title: 'Manage user accounts', detail: 'Find and create student, gate-officer, and administrator accounts.', view: 'users' },
        { title: 'Review registered PCs', detail: 'Approve devices or inspect their registration records.', view: 'devices' },
        { title: 'Review verification logs', detail: 'Inspect campus-wide gate activity.', view: 'logs' },
      ]

  return <section className="content-panel support-panel">
    <div className="support-heading"><div className="support-icon"><CircleHelp size={20} /></div><div><h2>How can we help?</h2><p>Choose a task to open the related SmartGate page.</p></div></div>
    <div className="support-links">{helpItems.map((item) => <button className="support-link" key={item.view} onClick={() => navigate(item.view)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRight size={16} /></button>)}</div>
    <a className="support-contact" href="mailto:smartgate@rp.ac.rw?subject=SmartGate%20support"><Mail size={17} /><span><strong>Contact campus support</strong><small>smartgate@rp.ac.rw</small></span><ArrowUpRight size={15} /></a>
  </section>
}

function UsersView({ users = [], currentUserId, onCreateUser, onUpdateUser, onDeleteUser }) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [deletingUser, setDeletingUser] = useState(null)
  const [newUserRole, setNewUserRole] = useState('student')
  const [submitting, setSubmitting] = useState(false)
  const safeUsers = Array.isArray(users) ? users : []
  const normalizedSearch = search.trim().toLowerCase()
  const visibleUsers = safeUsers.filter((user) => {
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    const matchesSearch = `${user.name} ${user.email} ${user.student_id || ''} ${user.role}`.toLowerCase().includes(normalizedSearch)
    return matchesRole && matchesSearch
  })
  const administratorCount = safeUsers.filter((user) => user.role === 'administrator').length

  const submitUser = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    setSubmitting(true)
    const created = await onCreateUser({
      name: String(formData.get('name')).trim(),
      email: String(formData.get('email')).trim(),
      student_id: newUserRole === 'student' ? String(formData.get('student_id')).trim() : null,
      role: newUserRole,
      password: String(formData.get('password')),
    })
    setSubmitting(false)
    if (created) {
      form.reset()
      setNewUserRole('student')
      setCreateFormOpen(false)
    }
  }

  const confirmDeleteUser = (user) => {
    const deviceCount = Number(user.deviceCount || user.computers_count || 0)
    const impact = user.role === 'gate_officer'
      ? ' Verification logs recorded by this gate officer will also be deleted.'
      : user.role === 'student' && deviceCount > 0
        ? ` ${deviceCount} registered PC${deviceCount === 1 ? '' : 's'} will also be deleted; verification history will remain without the PC link.`
        : ''
    setDeletingUser({ ...user, deleteMessage: `Permanently delete ${user.name} (${user.email})?${impact} This cannot be undone.` })
  }

  return <section className="content-panel table-panel users-panel">
    <div className="table-toolbar"><div><h3>User directory</h3><p>{safeUsers.length} accounts across all roles</p></div><button className="button button-primary" onClick={() => setCreateFormOpen((open) => !open)}><Plus size={15} />{createFormOpen ? 'Cancel' : 'Add user'}</button></div>
    {createFormOpen && <form className="user-create-form" onSubmit={submitUser}>
      <div className="user-create-heading"><div><strong>Create user account</strong><span>Add a student, gate officer, or administrator.</span></div></div>
      <div className="user-create-fields">
        <label className="field"><span>Full name <b>*</b></span><input name="name" required maxLength="120" /></label>
        <label className="field"><span>Email <b>*</b></span><input name="email" type="email" required maxLength="255" /></label>
        <label className="field"><span>Role <b>*</b></span><select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value)}><option value="student">Student</option><option value="gate_officer">Gate officer</option><option value="administrator">Administrator</option></select></label>
        {newUserRole === 'student' && <label className="field"><span>Student ID <b>*</b></span><input name="student_id" required maxLength="40" /></label>}
        <label className="field"><span>Temporary password <b>*</b></span><input name="password" type="password" required minLength="12" autoComplete="new-password" /><small>At least 12 characters.</small></label>
      </div>
      <div className="user-create-actions"><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create account'}</button></div>
    </form>}
    <div className="users-filter-toolbar">
      <label className="search-field"><Search size={15} /><input aria-label="Search users" placeholder="Search name, email, or ID..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="role-filter"><span>Role</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option><option value="student">Students</option><option value="gate_officer">Gate officers</option><option value="administrator">Administrators</option></select></label>
    </div>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>USER</th><th>ROLE</th><th>EMAIL</th><th>USER ID</th><th>REGISTERED PCs</th><th>ACTIONS</th></tr></thead><tbody>{visibleUsers.length ? visibleUsers.map((user) => <tr key={user.id}><td><div className="student-name-cell"><DirectoryUserAvatar user={user} /><strong>{user.name}</strong></div></td><td><span className={`user-role-pill user-role-${user.role}`}>{user.role === 'gate_officer' ? 'Gate officer' : user.role === 'administrator' ? 'Administrator' : 'Student'}</span></td><td>{user.email}</td><td>{user.id}</td><td>{Number(user.computers_count ?? user.deviceCount ?? 0)}</td><td className="row-actions"><button className="row-action" title="Edit user" aria-label={`Edit ${user.name}`} onClick={() => setEditingUser(user)}><Pencil size={15} /></button><button className="row-action row-action-danger" title="Delete user" aria-label={`Delete ${user.name}`} disabled={user.id === currentUserId || (user.role === 'administrator' && administratorCount <= 1)} onClick={() => confirmDeleteUser(user)}><Trash2 size={15} /></button></td></tr>) : <tr><td className="empty-cell" colSpan="6">{safeUsers.length ? 'No users match these filters.' : 'No user accounts found.'}</td></tr>}</tbody></table></div>
    {editingUser && <EditUserDialog user={editingUser} onClose={() => setEditingUser(null)} onSave={async (changes) => { const saved = await onUpdateUser(editingUser, changes); if (saved) setEditingUser(null); return saved }} />}
    {deletingUser && <ConfirmDeleteDialog title="Delete user account?" message={deletingUser.deleteMessage} onCancel={() => setDeletingUser(null)} onConfirm={() => onDeleteUser(deletingUser)} />}
  </section>
}

function EditUserDialog({ user, onClose, onSave }) {
  const [role, setRole] = useState(user.role)
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password')).trim()
    setSaving(true)
    const saved = await onSave({
      name: String(data.get('name')).trim(),
      email: String(data.get('email')).trim(),
      role,
      student_id: role === 'student' ? String(data.get('student_id')).trim() : null,
      password: password || null,
    })
    setSaving(false)
    if (saved) onClose()
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form className="record-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-user-title" onSubmit={submit}>
    <div className="record-dialog-heading"><div><h2 id="edit-user-title">Edit user account</h2><p>Update account details and role.</p></div><button type="button" className="icon-button" aria-label="Close edit form" onClick={onClose}><X size={17} /></button></div>
    <div className="record-dialog-fields">
      <label className="field"><span>Full name <b>*</b></span><input name="name" required maxLength="120" defaultValue={user.name} /></label>
      <label className="field"><span>Email <b>*</b></span><input name="email" type="email" required maxLength="255" defaultValue={user.email} /></label>
      <label className="field"><span>Role <b>*</b></span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="student">Student</option><option value="gate_officer">Gate officer</option><option value="administrator">Administrator</option></select></label>
      {role === 'student' && <label className="field"><span>Student ID <b>*</b></span><input name="student_id" required maxLength="40" defaultValue={user.student_id || ''} /></label>}
      <label className="field"><span>New password</span><input name="password" type="password" minLength="12" autoComplete="new-password" /><small>Leave blank to keep the current password; otherwise use at least 12 characters.</small></label>
    </div>
    <div className="record-dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></div>
  </form></div>
}

function ReportsView({ devices, students, todayCount, report }) {
  const verified = devices.filter((device) => device.status === 'Verified').length
  const unregistered = report?.unregisteredAttempts || 0
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - 6 + index)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const records = (report?.activity || []).filter((item) => String(item.day).slice(0, 10) === key)
    return {
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      verified: records.filter((item) => item.result === 'verified').reduce((total, item) => total + Number(item.total), 0),
      flagged: records.filter((item) => item.result !== 'verified').reduce((total, item) => total + Number(item.total), 0),
    }
  })
  const peak = Math.max(1, ...days.map((day) => day.verified + day.flagged))
  const ticks = [peak, Math.round(peak * 0.67), Math.round(peak * 0.33), 0]

  return <>
    <div className="report-metrics">
      <Metric label="Registered PCs" value={(report?.registeredPcs ?? devices.length).toLocaleString()} note="Stored in PostgreSQL" icon={Computer} color="mint" />
      <Metric label="Students covered" value={students.toLocaleString()} note="With registered devices" icon={Users} color="yellow" />
      <Metric label="Checks today" value={todayCount} note="Across all entrances" icon={ClipboardCheck} color="lilac" />
      <Metric label="Unregistered flags" value={unregistered} note="Requires follow-up" icon={AlertTriangle} color="peach" />
    </div>
    <div className="report-grid">
      <section className="content-panel chart-panel">
        <div className="panel-heading"><div><h3>Verification activity</h3><p>Gate checks over the past 7 days</p></div><span className="chart-legend"><i /> Verified <i className="legend-alert" /> Flagged</span></div>
        <div className="chart-area">
          <div className="chart-y-labels">{ticks.map((tick, index) => <span key={`${tick}-${index}`}>{tick}</span>)}</div>
          <div className="chart-main">
            <div className="chart-gridlines"><i /><i /><i /><i /></div>
            <div className="chart-columns">{days.map((day) => <div className="chart-day" key={day.label}><div className="chart-bar-stack"><i title={`${day.verified} verified`} style={{ height: `${(day.verified / peak) * 100}%` }} /><i className="chart-bar-alert" title={`${day.flagged} flagged`} style={{ height: `${(day.flagged / peak) * 100}%` }} /></div><span>{day.label}</span></div>)}</div>
          </div>
        </div>
      </section>
      <section className="content-panel report-breakdown">
        <div className="panel-heading"><div><h3>Device status</h3><p>Registration breakdown</p></div></div>
        <div className="donut-wrap"><div className="donut-chart"><div><strong>{report?.registeredPcs ?? devices.length}</strong><span>Total PCs</span></div></div></div>
        <div className="breakdown-rows"><div><i className="breakdown-dot verified-dot" /><span>Verified</span><strong>{report?.verifiedPcs ?? verified}</strong></div><div><i className="breakdown-dot pending-dot" /><span>Pending review</span><strong>{report?.pendingPcs ?? devices.length - verified}</strong></div></div>
      </section>
    </div>
  </>
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isToday(value) {
  return Boolean(value && new Date(value).toDateString() === new Date().toDateString())
}

export default App