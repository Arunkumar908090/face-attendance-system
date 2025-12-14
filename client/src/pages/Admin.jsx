import React, { useEffect, useState } from 'react';

function Admin() {
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [activeTab, setActiveTab] = useState('logs'); // 'users', 'logs', 'sessions'
    const [newSessionName, setNewSessionName] = useState('');
    const [bulkDate, setBulkDate] = useState('');

    useEffect(() => {
        fetchUsers();
        fetchLogs();
        fetchSessions(); // You might want to implement a fetchAllSessions endpoint or just active
    }, []);

    const fetchUsers = async () => {
        const res = await fetch('/api/users');
        const data = await res.json();
        setUsers(data);
    };

    const fetchLogs = async () => {
        const res = await fetch('/api/attendance');
        const data = await res.json();
        setLogs(data);
    };

    const fetchSessions = async () => {
        // for now we only have getActive, maybe add getAll later. 
        // Let's mock or just show active for now.
        // Actually, let's implement a quick getAllSessions if needed, but for now 
        // let's just use the create/toggle to manage.
        // Ideally we need a list of sessions. For MVP let's assume we can only see active one? 
        // Or let's add a getAllSessions endpoint to index.js? 
        // Wait, the plan didn't specify getAllSessions, but we need it for the list.
        // Let's stick to simple "Create New Session" and "Current Active Session".
        const res = await fetch('/api/sessions/active');
        const data = await res.json();
        // simple array for now
        setSessions(data ? [data] : []);
    };

    const createSession = async () => {
        if (!newSessionName) return;
        await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', name: newSessionName })
        });
        setNewSessionName('');
        fetchSessions();
    };

    const toggleSession = async (id, isActive) => {
        await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'toggle', id, isActive: !isActive })
        });
        fetchSessions();
    };

    const deleteUser = async (id) => {
        if (!window.confirm('Delete this user?')) return;
        await fetch(`/api/users/${id}`, { method: 'DELETE' });
        fetchUsers();
    };

    const deleteLog = async (id) => {
        if (!window.confirm('Delete this record?')) return;
        await fetch(`/api/attendance/${id}`, { method: 'DELETE' });
        fetchLogs();
    };

    const deleteBulk = async () => {
        if (!bulkDate || !window.confirm(`Delete all logs for ${bulkDate}?`)) return;
        await fetch('/api/attendance/bulk', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: bulkDate })
        });
        setBulkDate('');
        fetchLogs();
    };

    const exportData = () => {
        window.open('http://localhost:3000/api/export', '_blank');
    };

    return (
        <div className="page-container" style={{ alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <h2>Admin Dashboard</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className={`btn ${activeTab === 'logs' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('logs')}
                    >
                        Attendance
                    </button>
                    <button
                        className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('users')}
                    >
                        Users
                    </button>
                    <button
                        className={`btn ${activeTab === 'sessions' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('sessions')}
                    >
                        Sessions
                    </button>
                </div>
            </div>

            <div className="card" style={{ maxWidth: '100%', marginTop: '1rem', overflowX: 'auto' }}>
                {activeTab === 'logs' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h3>Attendance Logs</h3>
                            <div>
                                <input
                                    type="date"
                                    value={bulkDate}
                                    onChange={e => setBulkDate(e.target.value)}
                                    style={{ marginRight: '0.5rem', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', background: '#222', color: '#fff' }}
                                />
                                <button className="btn btn-secondary" onClick={deleteBulk} style={{ marginRight: '1rem', background: '#ef4444' }}>Delete Day</button>
                                <button className="btn btn-primary" onClick={exportData}>Export to Excel</button>
                            </div>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #444' }}>
                                    <th style={{ padding: '0.5rem' }}>Image</th>
                                    <th style={{ padding: '0.5rem' }}>Name</th>
                                    <th style={{ padding: '0.5rem' }}>Time</th>
                                    <th style={{ padding: '0.5rem' }}>Type</th>
                                    <th style={{ padding: '0.5rem' }}>Session</th>
                                    <th style={{ padding: '0.5rem' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid #333' }}>
                                        <td style={{ padding: '0.5rem' }}>
                                            {log.image ? (
                                                <img src={log.image} alt="capture" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} />
                                            ) : '-'}
                                        </td>
                                        <td style={{ padding: '0.5rem' }}>{log.name}</td>
                                        <td style={{ padding: '0.5rem' }}>{new Date(log.timestamp).toLocaleString()}</td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <span style={{
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: log.type === 'in' ? '#22c55e33' : '#ef444433',
                                                color: log.type === 'in' ? '#4ade80' : '#f87171'
                                            }}>
                                                {log.type.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.5rem' }}>{log.session_name || 'N/A'}</td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <button
                                                onClick={() => deleteLog(log.id)}
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '1rem' }}>No records found</td></tr>}
                            </tbody>
                        </table>
                    </>
                )}

                {activeTab === 'users' && (
                    <>
                        <h3>Registered Users</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #444' }}>
                                    <th style={{ padding: '0.5rem' }}>ID</th>
                                    <th style={{ padding: '0.5rem' }}>Name</th>
                                    <th style={{ padding: '0.5rem' }}>Registered At</th>
                                    <th style={{ padding: '0.5rem' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id} style={{ borderBottom: '1px solid #333' }}>
                                        <td style={{ padding: '0.5rem' }}>{user.id}</td>
                                        <td style={{ padding: '0.5rem' }}>{user.name}</td>
                                        <td style={{ padding: '0.5rem' }}>{new Date(user.created_at).toLocaleString()}</td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <button
                                                onClick={() => deleteUser(user.id)}
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '1rem' }}>No users found</td></tr>}
                            </tbody>
                        </table>
                    </>
                )}

                {activeTab === 'sessions' && (
                    <>
                        <h3>Manage Sessions</h3>
                        <div style={{ marginBottom: '2rem', display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="text"
                                placeholder="New Session Name (e.g., Morning Class)"
                                value={newSessionName}
                                onChange={e => setNewSessionName(e.target.value)}
                                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', background: '#222', color: 'white', flex: 1, maxWidth: '300px' }}
                            />
                            <button className="btn btn-primary" onClick={createSession}>Start New Session</button>
                        </div>

                        <h4>Active Session</h4>
                        {sessions.length > 0 ? (
                            <div style={{ padding: '1rem', background: '#22c55e11', border: '1px solid #22c55e33', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <strong style={{ fontSize: '1.2rem', color: '#4ade80' }}>{sessions[0].name}</strong>
                                    <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Started: {new Date(sessions[0].start_time).toLocaleString()}</div>
                                </div>
                                <button className="btn btn-secondary" onClick={() => toggleSession(sessions[0].id, true)}>End Session</button>
                            </div>
                        ) : (
                            <p>No active session.</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default Admin;
