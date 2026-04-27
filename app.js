const firebaseConfig = {
    apiKey: "PASTE_YOUR_API_KEY",
    authDomain: "PASTE_YOUR_AUTH_DOMAIN",
    projectId: "PASTE_YOUR_PROJECT_ID",
    storageBucket: "PASTE_YOUR_STORAGE_BUCKET",
    messagingSenderId: "PASTE_YOUR_SENDER_ID",
    appId: "PASTE_YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentUser = localStorage.getItem('gigtracker_user') || '';
let gigs = [];
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();
let calSelectedDate = new Date();
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('login-username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    if (currentUser) {
        loadFromCloud(currentUser);
    } else {
        showLoginScreen();
    }
});

function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    initTabs();
    initForm();
    initCalendar();
    renderGigsList();
    setDefaultFormDate();

    document.getElementById('header-logout').addEventListener('click', handleLogout);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

function handleLogin() {
    const input = document.getElementById('login-username');
    const username = input.value.trim().toLowerCase();

    if (!username) {
        showToast('Enter a username');
        return;
    }

    if (username.length < 2 || username.length > 30) {
        showToast('Username must be 2–30 characters');
        return;
    }

    currentUser = username;
    localStorage.setItem('gigtracker_user', currentUser);
    loadFromCloud(currentUser);
}

function handleLogout() {
    if (!confirm('Log out of "' + currentUser + '"?')) return;

    currentUser = '';
    gigs = [];
    localStorage.removeItem('gigtracker_user');
    localStorage.removeItem('gigtracker_events');
    showLoginScreen();
    document.getElementById('login-username').value = '';
}

async function loadFromCloud(username) {
    try {
        const doc = await db.collection('users').doc(username).get();

        if (doc.exists && doc.data().gigs) {
            gigs = doc.data().gigs;
        } else {
            const local = JSON.parse(localStorage.getItem('gigtracker_events') || '[]');
            gigs = local;

            if (gigs.length > 0) {
                saveToCloud();
            }
        }
    } catch (err) {
        gigs = JSON.parse(localStorage.getItem('gigtracker_events') || '[]');
    }

    saveLocal();
    showApp();
}

function saveGigs() {
    saveLocal();
    saveToCloud();
}

function saveLocal() {
    localStorage.setItem('gigtracker_events', JSON.stringify(gigs));
}

async function saveToCloud() {
    if (!currentUser) return;

    try {
        await db.collection('users').doc(currentUser).set({
            gigs: gigs,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        // Offline — data is safe in localStorage
    }
}
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const titles = { new: 'New Gig', calendar: 'Calendar', gigs: 'My Gigs' };

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');

            document.getElementById('header-title').textContent = titles[tab] || 'Gig Tracker';

            if (tab === 'calendar') renderCalendar();
            if (tab === 'gigs') renderGigsList();
        });
    });
}

function switchTab(tab) {
    document.querySelector(`.tab-btn[data-tab="${tab}"]`).click();
}
function initForm() {
    const form = document.getElementById('gig-form');
    const hasEnd = document.getElementById('gig-has-end');
    const endGroup = document.getElementById('end-time-group');
    const clearBtn = document.getElementById('btn-clear');

    hasEnd.addEventListener('change', () => {
        endGroup.style.display = hasEnd.checked ? 'block' : 'none';
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        createGig();
    });

    clearBtn.addEventListener('click', () => {
        form.reset();
        endGroup.style.display = 'none';
        setDefaultFormDate();
    });
}

function setDefaultFormDate() {
    const today = new Date();
    document.getElementById('gig-date').value = formatDateInput(today);
    document.getElementById('gig-start').value = '09:00';
    document.getElementById('gig-end').value = '17:00';
}

function createGig() {
    const title    = document.getElementById('gig-title').value.trim();
    const company  = document.getElementById('gig-company').value.trim();
    const location = document.getElementById('gig-location').value.trim();

    if (!title || !company || !location) {
        showToast('Please fill in Title, Company, and Location');
        return;
    }

    const hasEnd = document.getElementById('gig-has-end').checked;

    const gig = {
        id: crypto.randomUUID(),
        title,
        companyName: company,
        location,
        date:        document.getElementById('gig-date').value,
        startTime:   document.getElementById('gig-start').value,
        endTime:     hasEnd ? document.getElementById('gig-end').value : '',
        hasEndTime:  hasEnd,
        payRate:     document.getElementById('gig-pay').value.trim(),
        contactName: document.getElementById('gig-contact').value.trim(),
        contactPhone:document.getElementById('gig-phone').value.trim(),
        notes:       document.getElementById('gig-notes').value.trim(),
        createdAt:   new Date().toISOString()
    };

    gigs.unshift(gig);
    saveGigs();

    showDetailModal(gig);

    document.getElementById('gig-form').reset();
    document.getElementById('end-time-group').style.display = 'none';
    setDefaultFormDate();
}

function deleteGig(id) {
    gigs = gigs.filter(g => g.id !== id);
    saveGigs();
    renderGigsList();
    renderCalendar();
}
function parsePay(gig) {
    const raw = (gig.payRate || '').replace(/\$/g, '').replace(/,/g, '').trim().toLowerCase();
    const match = raw.match(/(\d+\.?\d*)/);
    if (!match) return 0;

    const amount = parseFloat(match[1]);
    const isHourly = /\/hr|\/hour|per hour|hourly/.test(raw);

    if (isHourly) {
        const hours = getGigDurationHours(gig);
        return amount * hours;
    }
    return amount;
}

function getGigDurationHours(gig) {
    if (!gig.hasEndTime || !gig.endTime) return 1;

    const [sh, sm] = gig.startTime.split(':').map(Number);
    const [eh, em] = gig.endTime.split(':').map(Number);

    let startMins = sh * 60 + sm;
    let endMins   = eh * 60 + em;

    if (endMins <= startMins) endMins += 1440;

    return Math.max((endMins - startMins) / 60, 0);
}

function formatPay(amount) {
    if (amount === 0) return '—';
    return '$' + amount.toFixed(2);
}

function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

function getWeekGigs(date) {
    const { start, end } = getWeekRange(date);
    return gigs.filter(g => {
        const gDate = new Date(g.date + 'T00:00:00');
        return gDate >= start && gDate <= end;
    });
}

function getWeeklyEarnings(date) {
    return getWeekGigs(date).reduce((sum, g) => sum + parsePay(g), 0);
}

function formatWeekRange(date) {
    const { start, end } = getWeekRange(date);
    const opts = { month: 'short', day: 'numeric' };
    return start.toLocaleDateString('en-US', opts) + ' – ' + end.toLocaleDateString('en-US', opts);
}
function formatDateInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDateFull(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShort(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime12(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getTimeRange(gig) {
    if (gig.hasEndTime && gig.endTime) {
        return formatTime12(gig.startTime) + ' – ' + formatTime12(gig.endTime);
    }
    return formatTime12(gig.startTime);
}

function isSameDay(dateStr, dateObj) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.getFullYear() === dateObj.getFullYear()
        && d.getMonth() === dateObj.getMonth()
        && d.getDate() === dateObj.getDate();
}
function initCalendar() {
    document.getElementById('cal-prev').addEventListener('click', () => {
        calMonth--;
        if (calMonth < 0) { calMonth = 11; calYear--; }
        renderCalendar();
    });

    document.getElementById('cal-next').addEventListener('click', () => {
        calMonth++;
        if (calMonth > 11) { calMonth = 0; calYear++; }
        renderCalendar();
    });

    renderCalendar();
}

function renderCalendar() {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('cal-month-label').textContent = monthNames[calMonth] + ' ' + calYear;

    updateCalendarEarnings();

    const container = document.getElementById('cal-days');
    container.innerHTML = '';

    const firstDay = new Date(calYear, calMonth, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < startWeekday; i++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell empty';
        cell.innerHTML = '<div class="cal-cell-num"></div><div class="cal-dot no-event"></div>';
        container.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(calYear, calMonth, day);
        const dateStr = formatDateInput(date);
        const hasEvents = gigs.some(g => g.date === dateStr);

        const isToday = date.getFullYear() === today.getFullYear()
                     && date.getMonth() === today.getMonth()
                     && date.getDate() === today.getDate();

        const isSelected = date.getFullYear() === calSelectedDate.getFullYear()
                        && date.getMonth() === calSelectedDate.getMonth()
                        && date.getDate() === calSelectedDate.getDate();

        const cell = document.createElement('div');
        cell.className = 'cal-cell' + (isToday ? ' today' : '') + (isSelected ? ' selected' : '');
        cell.innerHTML = `
            <div class="cal-cell-num">${day}</div>
            <div class="cal-dot ${hasEvents ? 'has-event' : 'no-event'}"></div>
        `;
        cell.addEventListener('click', () => {
            calSelectedDate = date;
            renderCalendar();
        });
        container.appendChild(cell);
    }

    renderCalendarDayEvents();
}

function updateCalendarEarnings() {
    const weekGigs = getWeekGigs(calSelectedDate);
    const total = weekGigs.reduce((sum, g) => sum + parsePay(g), 0);

    document.getElementById('week-range').textContent = formatWeekRange(calSelectedDate);
    document.getElementById('week-pay').textContent = formatPay(total);
    document.getElementById('week-gig-count').textContent = weekGigs.length;
}

function renderCalendarDayEvents() {
    const dateStr = formatDateInput(calSelectedDate);
    const dayGigs = gigs.filter(g => g.date === dateStr);

    document.getElementById('cal-selected-label').textContent = formatDateFull(dateStr);

    const container = document.getElementById('cal-day-events');
    container.innerHTML = '';

    if (dayGigs.length === 0) {
        container.innerHTML = `
            <div class="cal-empty">
                <div class="cal-empty-icon">☀️</div>
                <div class="cal-empty-text">No gigs this day</div>
            </div>
        `;
        return;
    }

    dayGigs.forEach(gig => {
        const pay = parsePay(gig);
        const card = document.createElement('div');
        card.className = 'cal-event-card';
        card.innerHTML = `
            <div class="cal-event-bar"></div>
            <div class="cal-event-info">
                <div class="cal-event-title">${esc(gig.title)}</div>
                <div class="cal-event-sub">${esc(gig.companyName)} · ${getTimeRange(gig)}</div>
            </div>
            ${pay > 0 ? `<div class="cal-event-pay">${formatPay(pay)}</div>` : ''}
        `;
        card.addEventListener('click', () => showDetailModal(gig));
        container.appendChild(card);
    });
}
function renderGigsList() {
    const list = document.getElementById('gigs-list');
    const empty = document.getElementById('gigs-empty');

    const today = new Date();
    const weekGigs = getWeekGigs(today);
    const weekTotal = weekGigs.reduce((sum, g) => sum + parsePay(g), 0);

    document.getElementById('gigs-week-range').textContent = formatWeekRange(today);
    document.getElementById('gigs-week-pay').textContent = formatPay(weekTotal);
    document.getElementById('gigs-week-count').textContent = weekGigs.length + ' gig' + (weekGigs.length === 1 ? '' : 's');

    if (gigs.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'flex';
        document.getElementById('gigs-week-banner').style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    document.getElementById('gigs-week-banner').style.display = 'block';

    list.innerHTML = '';

    gigs.forEach(gig => {
        const pay = parsePay(gig);
        const card = document.createElement('div');
        card.className = 'gig-card';
        card.innerHTML = `
            <button class="gig-card-delete" data-id="${gig.id}" title="Delete">✕</button>
            <div class="gig-card-title">${esc(gig.title)}</div>
            <div class="gig-card-row">
                <span class="gig-card-company">${esc(gig.companyName)}</span>
                <span class="gig-card-date">${formatDateShort(gig.date)}</span>
            </div>
            <div class="gig-card-row">
                <span class="gig-card-detail">🕐 ${getTimeRange(gig)}</span>
                ${pay > 0 ? `<span class="gig-card-pay">${formatPay(pay)}</span>` : ''}
            </div>
            <div class="gig-card-detail">📍 ${esc(gig.location)}</div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('gig-card-delete')) return;
            showDetailModal(gig);
        });

        card.querySelector('.gig-card-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete "' + gig.title + '"?')) {
                deleteGig(gig.id);
            }
        });

        list.appendChild(card);
    });
}
function showDetailModal(gig) {
    const modal = document.getElementById('detail-modal');
    const body = document.getElementById('detail-body');
    const pay = parsePay(gig);

    let html = `
        <div class="detail-header">
            <div class="detail-title">${esc(gig.title)}</div>
            <div class="detail-company">${esc(gig.companyName)}</div>

            <div class="detail-row">
                <span class="detail-icon">📍</span>
                <span>${esc(gig.location)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-icon">📅</span>
                <span>${formatDateFull(gig.date)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-icon">🕐</span>
                <span>${getTimeRange(gig)}</span>
            </div>
    `;

    if (gig.payRate) {
        html += `
            <div class="detail-row">
                <span class="detail-icon green">💲</span>
                <span>${esc(gig.payRate)}</span>
            </div>
        `;
    }

    if (gig.contactName) {
        html += `
            <div class="detail-row">
                <span class="detail-icon">👤</span>
                <span>${esc(gig.contactName)}${gig.contactPhone ? ' · ' + esc(gig.contactPhone) : ''}</span>
            </div>
        `;
    }

    if (gig.notes) {
        html += `
            <div class="detail-notes">
                <div class="detail-notes-label">Notes</div>
                <div class="detail-notes-text">${esc(gig.notes)}</div>
            </div>
        `;
    }

    if (pay > 0) {
        html += `
            <div class="detail-est-pay">
                <span class="detail-est-label">Estimated Pay</span>
                <span class="detail-est-amount">${formatPay(pay)}</span>
            </div>
        `;
    }

    html += `</div>`;

    const summary = buildEmailSummary(gig);
    html += `
        <div class="detail-section-label">EMAIL-READY SUMMARY</div>
        <div class="email-block">${esc(summary)}</div>
        <button class="btn btn-green btn-sm" onclick="copyToClipboard('${gig.id}')">
            <span class="btn-icon">📋</span> Copy to Clipboard
        </button>
    `;

    html += `
        <div class="detail-section-label">ADD TO CALENDAR</div>
        <button class="btn btn-primary btn-sm" onclick="downloadICS('${gig.id}')">
            <span class="btn-icon">📅</span> Download .ics File (Apple / Outlook)
        </button>
        <button class="btn btn-outline btn-sm" onclick="openGoogleCalendar('${gig.id}')">
            <span class="btn-icon">🌐</span> Open in Google Calendar
        </button>
    `;

    body.innerHTML = html;
    modal.style.display = 'flex';

    document.getElementById('modal-close').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

function buildEmailSummary(gig) {
    const line = '──────────────────────────────────────────';
    let lines = [];
    lines.push('JOB / EVENT CONFIRMATION');
    lines.push(line);
    lines.push('');
    lines.push('Title:           ' + gig.title);
    lines.push('Company:         ' + gig.companyName);
    lines.push('Location:        ' + gig.location);
    lines.push('Date:            ' + formatDateFull(gig.date));
    lines.push('Time:            ' + getTimeRange(gig));
    if (gig.payRate)      lines.push('Pay Rate:        ' + gig.payRate);
    if (gig.contactName)  lines.push('On-Site Contact: ' + gig.contactName);
    if (gig.contactPhone) lines.push('Contact Phone:   ' + gig.contactPhone);

    const pay = parsePay(gig);
    if (pay > 0) lines.push('Est. Total Pay:  ' + formatPay(pay));

    if (gig.notes) {
        lines.push('');
        lines.push('Notes:');
        lines.push(gig.notes);
    }
    lines.push('');
    lines.push(line);
    lines.push('Generated on ' + new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }));
    return lines.join('\n');
}

function copyToClipboard(id) {
    const gig = gigs.find(g => g.id === id);
    if (!gig) return;

    const summary = buildEmailSummary(gig);

    if (navigator.clipboard) {
        navigator.clipboard.writeText(summary).then(() => {
            showToast('Copied to clipboard ✓');
        }).catch(() => {
            fallbackCopy(summary);
        });
    } else {
        fallbackCopy(summary);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Copied to clipboard ✓');
}

function downloadICS(id) {
    const gig = gigs.find(g => g.id === id);
    if (!gig) return;

    const start = buildICSDateTime(gig.date, gig.startTime);
    const end   = gig.hasEndTime && gig.endTime
                ? buildICSDateTime(gig.date, gig.endTime)
                : buildICSDateTimeOffset(gig.date, gig.startTime, 60);

    const description = buildCalendarDescription(gig).replace(/\n/g, '\\n');

    const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//GigTracker//EN',
        'BEGIN:VEVENT',
        'UID:' + gig.id + '@gigtracker',
        'DTSTART:' + start,
        'DTEND:' + end,
        'SUMMARY:' + gig.title,
        'LOCATION:' + gig.location,
        'DESCRIPTION:' + description,
        'BEGIN:VALARM',
        'TRIGGER:-PT30M',
        'ACTION:DISPLAY',
        'DESCRIPTION:Reminder',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = gig.title.replace(/[^a-zA-Z0-9]/g, '_') + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Calendar file downloaded ✓');
}

function buildICSDateTime(dateStr, timeStr) {
    const [y, m, d] = dateStr.split('-');
    const [h, min] = timeStr.split(':');
    return y + m + d + 'T' + h.padStart(2,'0') + min.padStart(2,'0') + '00';
}

function buildICSDateTimeOffset(dateStr, timeStr, offsetMinutes) {
    const [y, m, d] = dateStr.split('-');
    const [h, min] = timeStr.split(':');
    const date = new Date(Number(y), Number(m)-1, Number(d), Number(h), Number(min) + offsetMinutes);
    const ny = date.getFullYear();
    const nm = String(date.getMonth()+1).padStart(2,'0');
    const nd = String(date.getDate()).padStart(2,'0');
    const nh = String(date.getHours()).padStart(2,'0');
    const nmin = String(date.getMinutes()).padStart(2,'0');
    return ny + nm + nd + 'T' + nh + nmin + '00';
}

function buildCalendarDescription(gig) {
    let parts = [];
    parts.push('Company: ' + gig.companyName);
    if (gig.payRate)      parts.push('Pay Rate: ' + gig.payRate);
    if (gig.contactName)  parts.push('On-Site Contact: ' + gig.contactName);
    if (gig.contactPhone) parts.push('Contact Phone: ' + gig.contactPhone);
    if (gig.notes)        parts.push('Notes: ' + gig.notes);
    return parts.join('\n');
}

function openGoogleCalendar(id) {
    const gig = gigs.find(g => g.id === id);
    if (!gig) return;

    const start = buildICSDateTime(gig.date, gig.startTime);
    const end   = gig.hasEndTime && gig.endTime
                ? buildICSDateTime(gig.date, gig.endTime)
                : buildICSDateTimeOffset(gig.date, gig.startTime, 60);

    const description = buildCalendarDescription(gig);

    const params = new URLSearchParams({
        action:   'TEMPLATE',
        text:     gig.title,
        dates:    start + '/' + end,
        location: gig.location,
        details:  description
    });

    window.open('https://calendar.google.com/calendar/render?' + params.toString(), '_blank');
}

function exportBackup() {
    if (gigs.length === 0) {
        showToast('No gigs to export');
        return;
    }

    const data = JSON.stringify(gigs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gig-tracker-backup-' + formatDateInput(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Backup downloaded ✓');
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);

            if (!Array.isArray(imported)) {
                showToast('Invalid backup file');
                return;
            }

            const existingIds = new Set(gigs.map(g => g.id));
            let added = 0;

            imported.forEach(g => {
                if (!existingIds.has(g.id)) {
                    gigs.push(g);
                    added++;
                }
            });

            gigs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            saveGigs();
            renderGigsList();
            renderCalendar();

            showToast(added + ' gig' + (added === 1 ? '' : 's') + ' restored ✓');
        } catch (err) {
            showToast('Could not read backup file');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message) {
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2500);
}
