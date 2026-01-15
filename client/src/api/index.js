const BASE_URL = '/api';

export const api = {
    users: {
        getAll: async (search = '') => {
            const res = await fetch(`${BASE_URL}/users${search ? `?search=${search}` : ''}`);
            return res.json();
        },
        register: async (userData) => {
            const isFormData = userData instanceof FormData;
            const res = await fetch(`${BASE_URL}/users/register`, {
                method: 'POST',
                headers: isFormData ? {} : { 'Content-Type': 'application/json' },
                body: isFormData ? userData : JSON.stringify(userData)
            });

            if (!res.ok) {
                const text = await res.text();
                try {
                    const json = JSON.parse(text);
                    return { success: false, error: json.error || res.statusText };
                } catch (e) {
                    return { success: false, error: `Server Error (${res.status}): ${text.substring(0, 100)}` };
                }
            }
            return res.json();
        },
        delete: async (id) => {
            const res = await fetch(`${BASE_URL}/users/${id}`, { method: 'DELETE' });
            return res.json();
        }
    },
    classes: {
        getAll: async () => {
            const res = await fetch(`${BASE_URL}/classes`);
            return res.json();
        },
        create: async (data) => {
            const res = await fetch(`${BASE_URL}/classes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return res.json();
        },
        delete: async (id) => {
            const res = await fetch(`${BASE_URL}/classes/${id}`, { method: 'DELETE' });
            return res.json();
        }
    },
    sessions: {
        getActive: async () => {
            const res = await fetch(`${BASE_URL}/sessions/active`);
            return res.json();
        },
        getHistory: async () => {
            const res = await fetch(`${BASE_URL}/sessions/history`);
            return res.json();
        },
        create: async (name, type, duration = 0, classId = null) => {
            const res = await fetch(`${BASE_URL}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', name, type, duration, classId })
            });
            return res.json();
        },
        toggleActive: async (id, isActive) => {
            const res = await fetch(`${BASE_URL}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle', id, isActive })
            });
            return res.json();
        },
        toggleType: async (id) => {
            const res = await fetch(`${BASE_URL}/sessions/${id}/type`, { method: 'PUT' });
            return res.json();
        },
        getStats: async (id) => {
            const res = await fetch(`${BASE_URL}/sessions/${id}/stats`);
            return res.json();
        },
        delete: async (id) => {
            const res = await fetch(`${BASE_URL}/sessions/${id}`, { method: 'DELETE' });
            return res.json();
        }
    },
    attendance: {
        getLogs: async (search = '') => {
            const res = await fetch(`${BASE_URL}/attendance${search ? `?search=${search}` : ''}`);
            return res.json();
        },
        log: async (userId, image) => {
            // Support FormData for image upload
            if (userId instanceof FormData) {
                const res = await fetch(`${BASE_URL}/attendance`, {
                    method: 'POST',
                    body: userId // In this case, first arg is FormData
                });
                return res.json();
            }

            const res = await fetch(`${BASE_URL}/attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, image })
            });
            return res.json();
        },
        delete: async (id) => {
            const res = await fetch(`${BASE_URL}/attendance/${id}`, { method: 'DELETE' });
            return res.json();
        },
        deleteBulk: async (date) => {
            const res = await fetch(`${BASE_URL}/attendance/bulk`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date })
            });
            return res.json();
        },
        exportUrl: `${BASE_URL}/attendance/export`,
        exportMatrixUrl: (identifier, isClass = false) => {
            const param = isClass ? `classId=${identifier}` : `sessionName=${encodeURIComponent(identifier)}`;
            return `${BASE_URL}/attendance/export-matrix?${param}`;
        }
    }
};
