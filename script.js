// Tailwind CSS configuration
tailwind.config = {
    theme: {
        extend: {
            colors: {
                primary: '#6b46c1',
                secondary: '#d53f8c',
                accent: '#38b2ac',
                'bg-light': '#f7f9fb',
                'bg-card': '#ffffff',
                'status-available': '#e9d8fd',
                'status-occupied-paid': '#b2f5ea',
                'status-occupied-due': '#feb2b2',
                'status-shift-complete': '#fbd38d',
            },
            borderRadius: {
                '4xl': '2.5rem',
            },
            transitionProperty: {
                'all': 'all',
                'transform': 'transform',
            },
            transitionDuration: {
                '500': '500ms',
                '700': '700ms',
            }
        }
    }
}

// Main application code (React/Babel script)
const VERSION = '_v24_date_fix'; 
const BACKUP_FILE_NAME = 'sst_backup_magadh.json';
const CSV_FILE_NAME = 'students_export.csv';
const AUTO_BACKUP_INTERVAL = 2 * 60 * 1000;
const AUTH_TIMEOUT = 3 * 60 * 1000; 
const DEACTIVATION_THRESHOLD_DAYS = 120; // 4 months * 30
const HIGHLIGHT_THRESHOLD_DAYS = 90; // 3 months * 30

function compressImage(dataUrl, maxWidth = 800, maxHeight = 800, quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const newDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(newDataUrl);
        };
        img.onerror = () => resolve(dataUrl); 
        img.src = dataUrl;
    });
}

function App() {
    const { useEffect, useState, useMemo, useRef, useCallback } = React;
    
    const initialHallsConfig = { A: 30, B: 16, C: 60 };
    
    const [users, setUsers] = useState(() => loadJSON(`sst_users${VERSION}`) || {
        owner: { username: 'MAGADH', password: 'Adit@7858', secQ: 'Your facility name?', secA: 'default', role: 'owner' }
    });
    const [auth, setAuth] = useState(() => loadJSON(`sst_auth${VERSION}`) || { loggedIn: false, user: null });
    const [hallsConfigState, setHallsConfigState] = useState(() => loadJSON(`sst_halls_config${VERSION}`) || initialHallsConfig);
    const [seats, setSeats] = useState(() => loadJSON(`studyspace_seats${VERSION}`) || initialSeats(hallsConfigState));
    const [students, setStudents] = useState(() => {
        const loadedStudents = loadJSON(`studyspace_students${VERSION}`) || {};
        for (const roll in loadedStudents) {
            loadedStudents[roll].payments = loadedStudents[roll].payments?.map(p => ({ ...p, discount: p.discount || 0, method: p.method || 'cash' })) || [];
            loadedStudents[roll].assignedAt = loadedStudents[roll].assignedAt || null;
            loadedStudents[roll].active = loadedStudents[roll].active !== false;
            loadedStudents[roll].feeChanges = loadedStudents[roll].feeChanges || [];
            loadedStudents[roll].formPhoto = loadedStudents[roll].formPhoto || '';
            loadedStudents[roll].assignedSeat = loadedStudents[roll].assignedSeat || '';
            loadedStudents[roll].deactivatedAt = loadedStudents[roll].deactivatedAt || null;
            loadedStudents[roll].pastHistory = loadedStudents[roll].pastHistory || [];
        }
        return loadedStudents;
    });
    const [activities, setActivities] = useState(() => loadJSON(`sst_activities${VERSION}`) || []);
    const [waTemplate, setWaTemplate] = useState(() => localStorage.getItem(`sst_wa_template${VERSION}`) || 'Hello {name}, your fee of ₹{due} is pending. Please pay ASAP. 🙏');
    const [timeShifts, setTimeShifts] = useState(() => loadJSON(`sst_time_shifts${VERSION}`) || [{ name: 'Morning', start: '06:00', end: '14:00' }, { name: 'Evening', start: '14:00', end: '22:00' }, { name: 'Night', start: '22:00', end: '06:00' }]);
    const [libraryName, setLibraryName] = useState(() => localStorage.getItem(`sst_library_name${VERSION}`) || 'MAGADH LIBRARY');
    const [showTodayCollection, setShowTodayCollection] = useState(false);
    const [backupDirHandle, setBackupDirHandle] = useState(null);
    const [lastBackupTime, setLastBackupTime] = useState(() => Number(localStorage.getItem(`sst_last_backup_time${VERSION}`)) || 0); 
    const [backupSuccess, setBackupSuccess] = useState(false);
    const [backupMessage, setBackupMessage] = useState('Backup Success!');
    const [showInactive, setShowInactive] = useState(false);
    const [showMonthCollection, setShowMonthCollection] = useState(false);
    const [showYearCollection, setShowYearCollection] = useState(false);
    const [qrCode, setQrCode] = useState(() => localStorage.getItem(`sst_qr_code${VERSION}`) || '');
    const [backupPath, setBackupPath] = useState(() => localStorage.getItem(`sst_backup_path${VERSION}`) || '');
    const [attendance, setAttendance] = useState(() => loadJSON(`sst_attendance${VERSION}`) || {});
    const [chatbotOpen, setChatbotOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState([{ sender: 'bot', text: 'Hello! Enter a student roll number to view details, "list" to see all students, "search [name/roll]" to search, or "help" for commands.' }]);
    const [chatInput, setChatInput] = useState('');

    const PAGES = { HOME: "home", STUDENT_RECORDS: "student_records", ACCOUNTS: "accounts", SEATS: "seats", SETTINGS: "settings", ATTENDANCE: "attendance" };
    const [page, setPage] = useState(PAGES.HOME);
    const [activeHall, setActiveHall] = useState('A');
    const [clock, setClock] = useState(getISTString());
    const [form, setForm] = useState({ roll: '', name: '', father: '', studentMobile: '', parentMobile: '', aadhar: '', photo: '', formPhoto: '', shift: 'Morning', feeAmount: 0, assignedSeat: '', admissionDate: new Date().toISOString().split('T')[0] });
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedSeat, setSelectedSeat] = useState(null);
    const [paymentModal, setPaymentModal] = useState({ open: false, roll: null, paymentAmount: 0, calculatedAmount: 0, discountAmount: 0, paymentDate: new Date().toISOString().split('T')[0], paymentDuration: 1, paymentType: 'month', photo: '', method: 'cash' });
    const [paymentNote, setPaymentNote] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [newShift, setNewShift] = useState({ name: '', start: '', end: '' });
    const [newHall, setNewHall] = useState('');
    const [hallSeatCounts, setHallSeatCounts] = useState(hallsConfigState);
    const [modalActiveHall, setModalActiveHall] = useState('A');
    
    const photoUploadRef = useRef(null);
    const formPhotoUploadRef = useRef(null);
    
    const [fullScreenPhotoModal, setFullScreenPhotoModal] = useState({ open: false, photoUrl: null });
    
    const [editStudentModal, setEditStudentModal] = useState({ open: false, student: null });
    const [editForm, setEditForm] = useState({ roll: '', name: '', father: '', studentMobile: '', parentMobile: '', aadhar: '', photo: '', formPhoto: '', shift: '', feeAmount: 0, assignedSeat: '', admissionDate: '' });

    const [editPaymentModal, setEditPaymentModal] = useState({ open: false, studentRoll: null, paymentIndex: null, payment: null });
    
    const [expandedPayments, setExpandedPayments] = useState({});
    const [studentDetailModal, setStudentDetailModal] = useState({ open: false, student: null });
    const [seatSearchTerm, setSeatSearchTerm] = useState('');

    // State for Dues List Filtering
    const [duesFilter, setDuesFilter] = useState({
        search: '',
        minAmount: '',
        maxAmount: '',
        dueSince: '',
        sortBy: 'dueSince', // 'dueSince', 'totalDues', 'name'
        sortOrder: 'asc' // 'asc', 'desc'
    });

    const authTimer = useRef(null);
    const [lastAuthTime, setLastAuthTime] = useState(0);
    const [changePasswordModal, setChangePasswordModal] = useState({ open: false, currentPassword: '', newPassword: '', confirmPassword: '' });

    // Attendance states
    const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0]);
    const [attRoll, setAttRoll] = useState('');
    const [attStatus, setAttStatus] = useState(true); // true: present, false: absent
    const [attSearch, setAttSearch] = useState('');

    useEffect(() => saveJSON(`sst_users${VERSION}`, users), [users]);
    useEffect(() => saveJSON(`sst_auth${VERSION}`, auth), [auth]);
    useEffect(() => saveJSON(`sst_halls_config${VERSION}`, hallsConfigState), [hallsConfigState]);
    useEffect(() => saveJSON(`studyspace_seats${VERSION}`, seats), [seats]);
    useEffect(() => saveJSON(`studyspace_students${VERSION}`, students), [students]);
    useEffect(() => saveJSON(`sst_activities${VERSION}`, activities), [activities]);
    useEffect(() => localStorage.setItem(`sst_wa_template${VERSION}`, waTemplate), [waTemplate]);
    useEffect(() => saveJSON(`sst_time_shifts${VERSION}`, timeShifts), [timeShifts]);
    useEffect(() => localStorage.setItem(`sst_library_name${VERSION}`, libraryName), [libraryName]);
    useEffect(() => localStorage.setItem(`sst_last_backup_time${VERSION}`, lastBackupTime.toString()), [lastBackupTime]);
    useEffect(() => localStorage.setItem(`sst_qr_code${VERSION}`, qrCode), [qrCode]);
    useEffect(() => localStorage.setItem(`sst_backup_path${VERSION}`, backupPath), [backupPath]);
    useEffect(() => saveJSON(`sst_attendance${VERSION}`, attendance), [attendance]);

    useEffect(() => {
        const autoBackupInterval = setInterval(backupData, AUTO_BACKUP_INTERVAL);
        return () => clearInterval(autoBackupInterval);
    }, [students, seats, activities, users, timeShifts, hallsConfigState, libraryName, qrCode, backupDirHandle, attendance]);

    useEffect(() => { const t = setInterval(() => setClock(getISTString()), 1000); return () => clearInterval(t); }, []);

    function initialSeats(config) {
        const obj = {};
        for (const hall of Object.keys(config)) {
            obj[hall] = {};
            for (let i = 1; i <= config[hall]; i++) {
                const id = `${hall}${i}`;
                obj[hall][id] = { id, hall, occupied: false, studentRoll: null };
            }
        }
        return obj;
    }

    function getISTString() {
        const now = new Date();
        return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(now);
    }

    function loadJSON(key) { try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch(e){} return null; }
    function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }
    
    function formatDate(dateString) { if (!dateString) return 'N/A'; const d = new Date(dateString); return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d); }

    // FIXED Financials Calculation Logic - Project paidUntil into future for multi-month payments
    const calculateStudentFinancials = useCallback((student) => {
        if (!student || !student.admissionDate || !student.feeAmount || !student.active) {
            return { totalDues: 0, paidUntil: null, amountPaid: 0, overpaid: 0, dueSince: null, daysDue: 0, paidMonths: 0 };
        }

        const feeAmount = Number(student.feeAmount);
        const admissionDate = new Date(student.admissionDate);
        const admissionDay = admissionDate.getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const limitDate = student.deactivatedAt ? new Date(student.deactivatedAt) : today;

        let currentPaidAmount = (student.payments || []).reduce((sum, p) => sum + p.amount + (p.discount || 0), 0); 
        let totalExpectedDues = 0;
        let paidUpToDate = new Date(admissionDate);
        paidUpToDate.setHours(0, 0, 0, 0);

        const feeChanges = [...(student.feeChanges || []), { date: admissionDate.toISOString(), fee: feeAmount }]
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // First, calculate paidUntil by projecting payments forward (even into future)
        let tempPaidAmount = currentPaidAmount;
        let currentCycleStart = new Date(admissionDate);
        currentCycleStart.setHours(0, 0, 0, 0);
        let paidMonths = 0;
        let feeChangeIndex = 0;
        let currentFee = feeChanges[0].fee;

        while (tempPaidAmount >= currentFee) {
            tempPaidAmount -= currentFee;
            let adjusted = false;
            let nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, admissionDay);
            if (nextCycleStart.getMonth() !== (currentCycleStart.getMonth() + 1) % 12) {
                nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, 0);
                adjusted = true;
            }

            while (feeChangeIndex < feeChanges.length - 1 && new Date(feeChanges[feeChangeIndex + 1].date) < nextCycleStart) {
                feeChangeIndex++;
                currentFee = feeChanges[feeChangeIndex].fee;
            }

            paidUpToDate = new Date(nextCycleStart);
            if (!adjusted) {
                paidUpToDate.setDate(paidUpToDate.getDate() - 1);
            }
            paidMonths++;
            currentCycleStart = nextCycleStart;
        }

        // Now, calculate totalExpectedDues up to limitDate
        currentCycleStart = new Date(admissionDate);
        currentCycleStart.setHours(0, 0, 0, 0);
        feeChangeIndex = 0;
        currentFee = feeChanges[0].fee;

        while (currentCycleStart <= limitDate) {
            let adjusted = false;
            let nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, admissionDay);
            if (nextCycleStart.getMonth() !== (currentCycleStart.getMonth() + 1) % 12) {
                nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, 0);
                adjusted = true;
            }

            while (feeChangeIndex < feeChanges.length - 1 && new Date(feeChanges[feeChangeIndex + 1].date) < nextCycleStart) {
                feeChangeIndex++;
                currentFee = feeChanges[feeChangeIndex].fee;
            }

            totalExpectedDues += currentFee;
            currentCycleStart = nextCycleStart;
        }

        let remainingDues = totalExpectedDues - currentPaidAmount;
        const overpaid = remainingDues < 0 ? Math.abs(remainingDues) : 0;
        remainingDues = remainingDues > 0 ? remainingDues : 0;

        let dueSince = null;
        let daysDue = 0;

        if (remainingDues > 0) {
            let calculatedDueSince = new Date(paidUpToDate);
            calculatedDueSince.setDate(calculatedDueSince.getDate() + 1);

            if (calculatedDueSince <= limitDate) {
                dueSince = calculatedDueSince;
                const timeDifference = limitDate.getTime() - dueSince.getTime();
                daysDue = Math.floor(timeDifference / (1000 * 3600 * 24)) + 1;
            } else {
                remainingDues = 0;
            }
        }

        return {
            totalDues: remainingDues,
            paidUntil: paidUpToDate.toISOString(),
            amountPaid: currentPaidAmount,
            overpaid,
            dueSince: dueSince ? dueSince.toISOString() : null,
            daysDue,
            paidMonths
        };
    }, []);

    function getDueFor(student) {
        if (!student) return 0;
        const { totalDues } = calculateStudentFinancials(student);
        return totalDues;
    }

    function getPaidUntilFor(student) {
        if (!student) return null;
        const { paidUntil } = calculateStudentFinancials(student);
        return paidUntil;
    }
    
    function getDueSinceFor(student) {
        if (!student) return null;
        const { dueSince } = calculateStudentFinancials(student);
        return dueSince;
    }

    function getDaysDueFor(student) {
        if (!student) return 0;
        const { daysDue } = calculateStudentFinancials(student);
        return daysDue;
    }
    
    function getPaidMonthsFor(student) {
        if (!student) return 0;
        const { paidMonths } = calculateStudentFinancials(student);
        return paidMonths;
    }
    
    function isDue(student) {
        return getDueFor(student) > 0;
    }
    
    function isOverpaid(student) {
        if (!student) return false;
        const { overpaid } = calculateStudentFinancials(student);
        return overpaid > 0;
    }

    function hasLatestPaymentDiscount(student) {
        if (!student?.payments || student.payments.length === 0) return false;
        const latestPayment = student.payments.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        return (latestPayment.discount || 0) > 0;
    }


    function isShiftComplete(student) {
        const now = new Date();
        const nowHours = now.getHours();
        const nowMinutes = now.getMinutes();
        const studentShift = timeShifts.find(s => s.name === student.shift);
        if (!studentShift) return false;

        const [startHour, startMinute] = studentShift.start.split(':').map(Number);
        const [endHour, endMinute] = studentShift.end.split(':').map(Number);

        const startTimeInMinutes = startHour * 60 + startMinute;
        const endTimeInMinutes = endHour * 60 + endMinute;
        const nowTimeInMinutes = nowHours * 60 + nowMinutes;

        if (startTimeInMinutes < endTimeInMinutes) {
            return nowTimeInMinutes > endTimeInMinutes;
        } else {
            const shiftEndedToday = endTimeInMinutes <= nowTimeInMinutes;
            const shiftEndedYesterday = endTimeInMinutes < startTimeInMinutes && (endTimeInMinutes + 1440) <= (nowTimeInMinutes + 1440);
            return shiftEndedToday || shiftEndedYesterday;
        }
    }

    function pushActivity(text) {
        const item = { text, time: new Date().toISOString() };
        setActivities(prev => { const next = [item, ...prev].slice(0, 20); return next; });
    }

    function loginUser({ username, password }) {
        username = (username || '').trim().toUpperCase();
        const u = Object.values(users).find(u => u.username === username);
        if (!u || u.password !== password) { alert('Invalid credentials'); return false; }
        if (u.role !== 'owner') { alert('Unauthorized role.'); return false; }
        setAuth({ loggedIn: true, user: { username: u.username, role: u.role } });
        pushActivity(`User logged in: ${u.username}`);
        return true;
    }

    function logout() { pushActivity(`User logged out: ${auth.user?.username || '?'}`); setAuth({ loggedIn: false, user: null }); }
    function requestPasswordReset(username) { username = (username || '').trim().toUpperCase(); const u = Object.values(users).find(u => u.username === username); if (!u) { alert('User not found'); return null; } return u.secQ; }
    function resetPassword(username, secA, newPassword) { username = (username || '').trim().toUpperCase(); const u = Object.values(users).find(u => u.username === username); if (!u) { alert('User not found'); return false; } if ((u.secA || '').toLowerCase().trim() !== (secA || '').toLowerCase().trim()) { alert('Answer incorrect'); return false; } 
        setUsers(prev => {
            const copy = { ...prev };
            const key = Object.keys(copy).find(k => copy[k].username === username);
            if (key) {
                copy[key] = { ...copy[key], password: newPassword };
            }
            return copy;
        });
        pushActivity(`Password reset: ${username}`); alert('Password reset.'); return true; }

    function changePassword({ currentPassword, newPassword }) {
        const u = users.owner;
        if (u.password !== currentPassword) { alert('Incorrect current password'); return false; }
        setUsers(prev => ({ ...prev, owner: { ...prev.owner, password: newPassword } }));
        pushActivity('Password changed.');
        alert('Password changed successfully.');
        return true;
    }

    async function addOrUpdateStudent(e) {
        e?.preventDefault?.();
        const editPassword = prompt("Enter password to save/edit student:");
        if (editPassword !== "123") {
            alert("Incorrect password.");
            return;
        }
        let { roll, name, father, studentMobile, parentMobile, aadhar, photo, formPhoto, shift, feeAmount, assignedSeat, admissionDate } = form;
        if (!roll.trim() || !name.trim()) { alert('Roll and name required'); return; }
        if (studentMobile && studentMobile.length !== 10) { alert('Student mobile number must be 10 digits.'); return; }
        if (parentMobile && parentMobile.length !== 10) { alert('Parent mobile number must be 10 digits.'); return; }
        if (aadhar && aadhar.length !== 12) { alert('Aadhar number must be 12 digits.'); return; }
        
        if (photo) {
            photo = await compressImage(photo);
        }
        if (formPhoto) {
            formPhoto = await compressImage(formPhoto);
        }

        let isNewStudent = false;
        setStudents(prev => {
            const copy = { ...prev };
            isNewStudent = !copy[roll];
            const existing = copy[roll] || { payments: [], amountPaid: 0, paidUntil: null, admissionDate: admissionDate, feeChanges: [], pastHistory: [] };
            
            const newFee = Number(feeAmount);
            const feeChanges = [...(existing.feeChanges || [])];
            if (newFee !== existing.feeAmount) {
                feeChanges.push({ date: new Date().toISOString(), fee: newFee });
            }
            
            const updatedStudent = {
                ...existing,
                roll,
                name,
                father,
                studentMobile,
                parentMobile,
                aadhar,
                photo: photo || existing.photo,
                formPhoto: formPhoto || existing.formPhoto,
                shift,
                feeAmount: newFee,
                assignedSeat,
                admissionDate: admissionDate,
                assignedAt: existing.assignedAt || null,
                active: existing.active !== false,
                feeChanges,
                deactivatedAt: existing.deactivatedAt || null,
                pastHistory: existing.pastHistory || []
            };

            copy[roll] = updatedStudent;
            return copy;
        });

        if (assignedSeat) {
            assignSeatById(assignedSeat, roll);
        }

        setForm({ roll: '', name: '', father: '', studentMobile: '', parentMobile: '', aadhar: '', photo: '', formPhoto: '', shift: 'Morning', feeAmount: 0, assignedSeat: '', admissionDate: new Date().toISOString().split('T')[0] });
        pushActivity(`Student saved: ${roll} — ${name}`);
        alert('Student saved.');

        if (isNewStudent) {
            openPaymentModal(roll);
        }
    }
    
    async function updateStudentFromModal(e) {
        e?.preventDefault?.();
        const editPassword = prompt("Enter password to update student:");
        if (editPassword !== "123") {
            alert("Incorrect password.");
            return;
        }
        let { roll, name, father, studentMobile, parentMobile, aadhar, photo, formPhoto, shift, feeAmount, assignedSeat, admissionDate } = editForm;
        if (!roll.trim() || !name.trim()) { alert('Roll and name required'); return; }
        if (studentMobile && studentMobile.length !== 10) { alert('Student mobile number must be 10 digits.'); return; }
        if (parentMobile && parentMobile.length !== 10) { alert('Parent mobile number must be 10 digits.'); return; }
        if (aadhar && aadhar.length !== 12) { alert('Aadhar number must be 12 digits.'); return; }
        
        if (photo && editStudentModal.student?.photo !== photo) {
            photo = await compressImage(photo);
        }
        if (formPhoto && editStudentModal.student?.formPhoto !== formPhoto) {
            formPhoto = await compressImage(formPhoto);
        }

        let updatedStudent;
        setStudents(prev => {
            const copy = { ...prev };
            const existing = copy[roll] || {};
            
            const newFee = Number(feeAmount);
            const feeChanges = [...(existing.feeChanges || [])];
            if (newFee !== existing.feeAmount) {
                feeChanges.push({ date: new Date().toISOString(), fee: newFee });
            }
            
            updatedStudent = {
                ...existing,
                roll,
                name,
                father,
                studentMobile,
                parentMobile,
                aadhar,
                photo: photo || existing.photo,
                formPhoto: formPhoto || existing.formPhoto,
                shift,
                feeAmount: newFee,
                admissionDate: admissionDate,
                assignedAt: existing.assignedAt || null,
                payments: existing.payments || [],
                active: existing.active,
                feeChanges,
                deactivatedAt: existing.deactivatedAt || null,
                pastHistory: existing.pastHistory || []
            };

            copy[roll] = updatedStudent;
            return copy;
        });
    
        const currentAssignedSeat = findSeatByRoll(roll);
        if (assignedSeat && assignedSeat !== currentAssignedSeat) {
            assignSeatById(assignedSeat, roll);
        } else if (!assignedSeat && currentAssignedSeat) {
            releaseSeat({ id: currentAssignedSeat, hall: currentAssignedSeat.charAt(0) }, roll);
        }
    
        pushActivity(`Student updated: ${roll} — ${name}`);
        alert('Student updated.');
        setEditStudentModal({ open: false, student: null });
        setStudentDetailModal(prev => ({ ...prev, student: updatedStudent })); 
    }

    function deleteStudent(roll) {
        const password = prompt("Enter password to delete student:");
        if (password === Object.values(users).find(u => u.username === auth.user.username).password) {
            setStudents(prev => { const copy = { ...prev }; delete copy[roll]; return copy; });
            setSeats(prev => { const copy = JSON.parse(JSON.stringify(prev)); for (const h of Object.keys(copy)) for (const s of Object.keys(copy[h])) if (copy[h][s].studentRoll === roll) { copy[h][s].occupied = false; copy[h][s].studentRoll = null; } return copy; });
            pushActivity(`Student deleted: ${roll}`);
            setStudentDetailModal({ open: false, student: null });
        } else {
            alert("Incorrect password.");
        }
    }

    function resetStudent(roll) {
        const p1 = prompt("Enter password to reset student:");
        if (p1 !== "123") {
            alert("Incorrect password.");
            return;
        }
        const p2 = prompt("Confirm password to reset:");
        if (p1 !== p2) {
            alert("Passwords do not match.");
            return;
        }
        if (window.confirm("This will reset the admission date to today and clear all payments. Proceed?")) {
            let updatedStudent;
            setStudents(prev => {
                const copy = { ...prev };
                const s = copy[roll];
                if (s) {
                    s.pastHistory = [...(s.pastHistory || []), ...(s.payments || [])];
                    s.admissionDate = new Date().toISOString().split('T')[0];
                    s.payments = [];
                    s.feeChanges = [{ date: new Date().toISOString(), fee: s.feeAmount }];
                    updatedStudent = s;
                }
                return copy;
            });
            pushActivity(`Student reset: ${roll}`);
            alert("Student reset successfully.");
            setStudentDetailModal(prev => ({ ...prev, student: updatedStudent })); 
        }
    }

    function toggleActive(roll) {
        const student = students[roll];
        if (!student) return;
        const newActive = !student.active;
        
        let updatedStudent;
        setStudents(prev => {
            updatedStudent = { ...student, active: newActive, assignedSeat: newActive ? student.assignedSeat : null, deactivatedAt: newActive ? null : new Date().toISOString() };
            return {
                ...prev,
                [roll]: updatedStudent
            };
        });
        if (!newActive && student.assignedSeat) {
            releaseSeat({ id: student.assignedSeat, hall: student.assignedSeat.charAt(0) }, roll);
        }
        pushActivity(`Student ${newActive ? 'activated' : 'deactivated'}: ${roll}`);
        setStudentDetailModal(prev => ({ ...prev, student: updatedStudent }));
    }

    function assignSeatById(seatId, roll) {
        if (!seatId || !roll) return;
        const hall = seatId.charAt(0);
        if (!seats[hall] || !seats[hall][seatId]) { alert('Seat does not exist'); return; }
        setSeats(prev => {
            const copy = JSON.parse(JSON.stringify(prev));
            for (const h of Object.keys(copy)) {
                for (const s of Object.keys(copy[h])) {
                    if (copy[h][s].studentRoll === roll) {
                        copy[h][s].occupied = false;
                        copy[h][s].studentRoll = null;
                    }
                }
            }
            const currentOccupant = copy[hall][seatId].studentRoll;
            if (currentOccupant && currentOccupant !== roll) {
                if (!window.confirm(`${seatId} is occupied by ${currentOccupant}. Overwrite?`)) return prev;
            }
            copy[hall][seatId].occupied = true;
            copy[hall][seatId].studentRoll = roll;
            return copy;
        });
        let updatedStudent;
        setStudents(prev => {
            updatedStudent = { ...prev[roll], assignedSeat: seatId, assignedAt: new Date().toISOString() };
            return {
                ...prev,
                [roll]: updatedStudent
            }
        });
        pushActivity(`Assigned ${roll} → ${seatId}`);
        if(studentDetailModal.open && studentDetailModal.student?.roll === roll) {
            setStudentDetailModal(prev => ({ ...prev, student: updatedStudent }));
        }
    }

    function assignSeatToSelectedRoll(seatId, roll) {
        assignSeatById(seatId, roll);
        setShowAssignModal(false);
        setSelectedSeat(null);
    }

    function releaseSeat(seat, studentRoll = null) {
        const editPassword = prompt("Enter password to release seat:");
        if (editPassword !== "123") {
            alert("Incorrect password.");
            return;
        }
        if (!window.confirm(`Release ${seat.id}?`)) return;
        setSeats(prev => {
            const copy = JSON.parse(JSON.stringify(prev));
            if (copy[seat.hall] && copy[seat.hall][seat.id]) {
                copy[seat.hall][seat.id].occupied = false;
                copy[seat.hall][seat.id].studentRoll = null;
            }
            return copy;
        });
        if (studentRoll) {
            let updatedStudent;
            setStudents(prev => {
                updatedStudent = { ...prev[studentRoll], assignedSeat: null, assignedAt: null };
                return {
                    ...prev,
                    [studentRoll]: updatedStudent
                }
            });
            setStudentDetailModal(prev => ({ ...prev, student: updatedStudent }));
        }
        pushActivity(`Released ${seat.id}`);
    }

    function openPaymentModal(roll) {
        const student = students[roll];
        const financials = calculateStudentFinancials(student);
        const defaultDuration = 1;
        const calculatedAmount = defaultDuration * (student?.feeAmount || 0);
        const paymentAmount = calculatedAmount;

        setPaymentModal({
            open: true,
            roll,
            paymentAmount: paymentAmount, 
            calculatedAmount: calculatedAmount, 
            discountAmount: 0, 
            paymentDate: new Date().toISOString().split('T')[0],
            paymentDuration: defaultDuration,
            paymentType: 'month',
            photo: '',
            method: 'cash'
        });
        setPaymentNote('');
    }
    
    const handleDurationChange = (e) => {
        const newDuration = Number(e.target.value);
        const roll = paymentModal.roll;
        const student = students[roll];
        const calculatedAmount = student ? newDuration * student.feeAmount : newDuration;
        const expectedAmount = calculatedAmount - paymentModal.discountAmount;

        setPaymentModal({
            ...paymentModal,
            paymentDuration: newDuration,
            calculatedAmount: calculatedAmount,
            paymentAmount: expectedAmount 
        });
    };

    const handleDiscountChange = (e) => {
        const newDiscount = Number(e.target.value);
        const expectedAmount = paymentModal.calculatedAmount - newDiscount;

        setPaymentModal({
            ...paymentModal,
            discountAmount: newDiscount,
            paymentAmount: expectedAmount 
        });
    };

    const handlePaymentPhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const compressedPhoto = await compressImage(reader.result);
                setPaymentModal({...paymentModal, photo: compressedPhoto});
            };
            reader.readAsDataURL(file);
        }
    };
    
    function addPayment(roll, amount, date, duration, type, note, discount, photo, method) {
        const editPassword = prompt("Enter password to add payment:");
        if (editPassword !== "123") {
            alert("Incorrect password.");
            return;
        }
        const student = students[roll];
        if (!student) { alert('Student not found'); return; }
        const amt = Number(amount);
        const disc = Number(discount);
        if (!amt || amt <= 0) { alert('Final amount received must be greater than 0'); return; }
        
        let updatedStudent;

        setStudents(prev => {
            const updatedStudentData = { ...prev[roll] };
            const paymentDate = new Date(date).toISOString();
            
            const newPayment = {
                amount: amt,
                date: paymentDate,
                duration: Number(duration),
                type: type,
                note: note || '',
                discount: disc, 
                id: Date.now() + Math.random().toString(36).substring(2, 9),
                photo,
                method
            };

            const newPayments = [...(updatedStudentData.payments || []), newPayment];
            
            updatedStudent = {
                ...updatedStudentData,
                payments: newPayments
            };
            
            return {
                ...prev,
                [roll]: updatedStudent
            };
        });
        pushActivity(`Payment of ₹${amt} (Discount: ₹${disc}, Method: ${method}) added for ${roll}`);
        setPaymentModal({ open: false, roll: null });
        setStudentDetailModal(prev => ({ ...prev, student: updatedStudent })); 
    }

    function updatePayment(studentRoll, paymentId, updatedPayment) {
        const editPassword = prompt("Enter password to update payment:");
        if (editPassword !== "123") {
            alert("Incorrect password.");
            return;
        }
        let updatedStudent;
        setStudents(prevStudents => {
            const student = { ...prevStudents[studentRoll] };
            if (!student || !student.payments) return prevStudents;
    
            const newPayments = student.payments.map(p => p.id === paymentId ? { ...p, ...updatedPayment } : p);
            
            updatedStudent = {
                ...student,
                payments: newPayments
            };
    
            return {
                ...prevStudents,
                [studentRoll]: updatedStudent
            };
        });
        pushActivity(`Payment updated for ${studentRoll}`);
        setEditPaymentModal({ open: false, studentRoll: null, paymentIndex: null, payment: null });
        setStudentDetailModal(prev => ({ ...prev, student: updatedStudent })); 
    }

    function deletePayment(studentRoll, paymentIdToDelete) {
        const editPassword = prompt("Enter password to delete payment:");
        if (editPassword !== "123") {
            alert("Incorrect password.");
            return;
        }
        if (!window.confirm("Are you sure you want to delete this payment? This will affect the student's due date.")) return;
        let updatedStudent;
        setStudents(prevStudents => {
            const student = { ...prevStudents[studentRoll] };
            if (!student || !student.payments) return prevStudents;
    
            const newPayments = student.payments.filter(p => p.id !== paymentIdToDelete);
            
            updatedStudent = {
                ...student,
                payments: newPayments
            };
    
            return {
                ...prevStudents,
                [studentRoll]: updatedStudent
            };
        });
        pushActivity(`Payment deleted for ${studentRoll}`);
        setStudentDetailModal(prev => ({ ...prev, student: updatedStudent })); 
    }
    
    const accountsSummary = useCallback(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisYear = new Date(now.getFullYear(), 0, 1);
        
        let todayTotal = 0, todayCash = 0, todayOnline = 0;
        let monthTotal = 0, monthCash = 0, monthOnline = 0;
        let yearTotal = 0, yearCash = 0, yearOnline = 0;
        const dues = [];

        for (const r of Object.values(students)) {
            (r.payments || []).forEach(p => {
                const d = new Date(p.date);
                const amount = p.amount;
                const isCash = p.method === 'cash';
                if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
                    todayTotal += amount; 
                    if (isCash) todayCash += amount; else todayOnline += amount;
                }
                if (d >= thisMonth) {
                    monthTotal += amount;
                    if (isCash) monthCash += amount; else monthOnline += amount;
                }
                if (d >= thisYear) {
                    yearTotal += amount;
                    if (isCash) yearCash += amount; else yearOnline += amount;
                }
            });
            
            const { totalDues, paidUntil, dueSince } = calculateStudentFinancials(r);

            if (totalDues > 0 && (r.feeAmount || 0) > 0 && r.active) {
                dues.push({ ...r, totalDues, paidUntil, dueSince });
            }
        }
        
        dues.sort((a, b) => new Date(a.paidUntil) - new Date(b.paidUntil));

        return { todayTotal, todayCash, todayOnline, monthTotal, monthCash, monthOnline, yearTotal, yearCash, yearOnline, dues };
    }, [students, calculateStudentFinancials]);

    function totalCountsAll() { 
        let total = 0, occupied = 0; 
        for (const h of Object.keys(hallsConfigState)) { 
            total += hallsConfigState[h]; 
            for (const s of Object.values(seats[h] || {})) if (s.occupied) occupied++; 
        } 
        return { total, occupied, available: total - occupied }; 
    }

    function totalCountsHall(hall) {
        const total = hallsConfigState[hall] || 0;
        let occupied = 0;
        for (const s of Object.values(seats[hall] || {})) {
            if (s.occupied) occupied++
        }
        return { total, occupied, available: total - occupied };
    }


    async function exportStudentsCSV() {
        const rows = ['roll,name,studentMobile'];
        for (const s of Object.values(students)) {
            rows.push([
                s.roll, s.name, s.studentMobile || s.parentMobile
            ].map(x=>`"${String(x||'').replace(/"/g,'""')}"`).join(','));
        }
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `students_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        pushActivity('Exported students CSV to default download location.');
    }

    function waMessageFor(s) {
        const due = getDueFor(s);
        return waTemplate.replace(/\{name\}/g, s.name||'').replace(/\{roll\}/g, s.roll||'').replace(/\{due\}/g, String(due));
    }

    function findSeatByRoll(roll) {
        for (const h of Object.keys(seats)) {
            for (const s of Object.values(seats[h])) {
                if (s.studentRoll === roll) return s.id;
            }
        }
        return null;
    }

    // Updated getSeatColor to use getDaysDueFor
    function getSeatColor(seat) {
        const student = seat.studentRoll ? students[seat.studentRoll] : null;
        if (!seat.occupied) return 'bg-status-available border-purple-300'; 
        if (student) {
            if (getDaysDueFor(student) > 0) return 'bg-status-occupied-due border-red-400'; 
            if (isShiftComplete(student)) return 'bg-status-shift-complete border-orange-400'; 
        }
        return 'bg-status-occupied-paid border-teal-300'; 
    }

    const allSeats = useMemo(() => Object.values(seats).flatMap(Object.values), [seats]);
    
    const filteredSeats = useMemo(() => {
        if (!seatSearchTerm.trim()) return allSeats.filter(s => s.hall === activeHall);

        const lowerCaseSearch = seatSearchTerm.toLowerCase();
        const allMatchingSeats = allSeats.filter(seat => {
            if (seat.studentRoll) {
                const student = students[seat.studentRoll];
                return (
                    seat.id.toLowerCase().includes(lowerCaseSearch) ||
                    student?.roll.toLowerCase().includes(lowerCaseSearch) ||
                    student?.name.toLowerCase().includes(lowerCaseSearch) ||
                    (student?.studentMobile && student.studentMobile.toLowerCase().includes(lowerCaseSearch)) ||
                    (student?.parentMobile && student.parentMobile.toLowerCase().includes(lowerCa...(truncated 117291 characters)...Payments}
                    expandedPayments={expandedPayments}
                    timeShifts={timeShifts}
                    handleViewPhoto={handleViewPhoto}
                    toggleActive={toggleActive}
                    resetStudent={resetStudent}
                />
            )}
            {paymentModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
                    <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl transform transition-all duration-500 scale-100 max-h-[80vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4 text-secondary-gradient">Add Payment for {paymentModal.roll}</h3>
                        <div className="space-y-4">
                            <label className="block text-sm font-bold text-gray-700">Payment Date</label>
                            <input type="date" value={paymentModal.paymentDate} onChange={e => setPaymentModal({ ...paymentModal, paymentDate: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-600 transition-all duration-300" />
                            
                            <label className="block text-sm font-bold text-gray-700">Duration (for record)</label>
                            <div className="flex gap-4 items-center">
                                <select
                                    value={paymentModal.paymentDuration}
                                    onChange={handleDurationChange} 
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-600 transition-all duration-300 font-semibold"
                                >
                                    {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1} Month(s)</option>)}
                                </select>
                            </div>

                            <div className="text-md font-semibold text-gray-600 p-3 bg-purple-100 rounded-xl border border-purple-300">
                                Calculated Fee: <span className="text-lg font-black text-primary">₹{paymentModal.calculatedAmount.toLocaleString('en-IN')}</span>
                            </div>

                            <label className="block text-sm font-bold text-gray-700">Discount Amount (₹)</label>
                            <input type="number" placeholder="Discount Amount (e.g., 200)" value={paymentModal.discountAmount} onChange={handleDiscountChange} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-600 transition-all duration-300" />

                            <div className="text-md font-semibold text-gray-600 p-3 bg-purple-100 rounded-xl border border-purple-300">
                                Expected after Discount: <span className="text-lg font-black text-primary">₹{(paymentModal.calculatedAmount - paymentModal.discountAmount).toLocaleString('en-IN')}</span>
                            </div>

                            <label className="block text-sm font-bold text-gray-700">Amount Received (₹)</label>
                            <input type="number" placeholder="Amount Received" value={paymentModal.paymentAmount} onChange={e => setPaymentModal({...paymentModal, paymentAmount: Number(e.target.value)})} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-600 transition-all duration-300" />

                            {paymentModal.paymentAmount < (paymentModal.calculatedAmount - paymentModal.discountAmount) && paymentModal.paymentAmount > 0 && (
                                <div className="text-red-600 font-bold text-sm p-2 bg-red-100 rounded-xl">
                                    Partial Payment: Will cover approximately {Math.floor(paymentModal.paymentAmount / (students[paymentModal.roll].feeAmount / 30))} days
                                </div>
                            )}

                            <label className="block text-sm font-bold text-gray-700">Payment Method</label>
                            <select value={paymentModal.method} onChange={e => setPaymentModal({ ...paymentModal, method: e.target.value })} className="w-full px-4 py-3 border rounded-xl focus:ring-green-600 font-semibold">
                                <option value="cash">Cash</option>
                                <option value="online">Online</option>
                            </select>
                            
                            <label className="block text-sm font-bold text-gray-700">Bill Photo (optional)</label>
                            <input type="file" onChange={handlePaymentPhotoUpload} accept="image/*" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary transition-all duration-300" />
                            {paymentModal.photo && <button type="button" onClick={() => handleViewPhoto(paymentModal.photo)} className="px-4 py-2 text-sm rounded-lg font-semibold bg-secondary text-white hover:bg-pink-700 shadow-md shadow-secondary/30">View Bill Photo</button>}
                            
                            <input placeholder="Note (optional)" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-600 transition-all duration-300" />
                            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
                                <button onClick={() => setPaymentModal({ open: false, roll: null })} className="px-6 py-3 rounded-xl border border-gray-300 font-bold hover:bg-gray-100 transition-colors transform hover:scale-105">Cancel</button>
                                <button 
                                    onClick={() => addPayment(
                                        paymentModal.roll, 
                                        Math.max(0, paymentModal.paymentAmount), 
                                        paymentModal.paymentDate, 
                                        paymentModal.paymentDuration, 
                                        paymentModal.paymentType, 
                                        paymentNote,
                                        paymentModal.discountAmount,
                                        paymentModal.photo,
                                        paymentModal.method
                                    )} 
                                    className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors transform hover:scale-105 shadow-md shadow-green-600/30"
                                    disabled={Math.max(0, paymentModal.paymentAmount) <= 0}
                                >
                                    Add Payment
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showAssignModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
                    <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl transform transition-all duration-500 scale-100">
                        <h3 className="text-xl font-bold mb-4 text-primary-gradient">Assign Student to Seat</h3>
                        <input placeholder="Enter student roll" id="assignRollInput" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary mb-4 transition-all duration-300" />
                        <div className="mt-4 grid grid-cols-5 gap-2 border-b border-gray-200 pb-4">
                            {Object.keys(hallsConfigState).map(hall =>
                                <button 
                                    key={hall} 
                                    onClick={() => setModalActiveHall(hall)} 
                                    className={`py-2 px-2 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 ${modalActiveHall === hall ? 'bg-secondary text-white shadow-md shadow-secondary/50' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                >
                                    Hall {hall}
                                </button>
                            )}
                        </div>
                        {modalActiveHall && (
                            <div className="mt-4 grid grid-cols-6 gap-3 max-h-60 overflow-y-auto pt-4">
                                {Object.values(seats[modalActiveHall] || {}).map(seat => (
                                    <button
                                        type="button"
                                        key={seat.id}
                                        onClick={() => {
                                            const roll = document.getElementById('assignRollInput').value.trim();
                                            if (roll) {
                                                assignSeatToSelectedRoll(seat.id, roll);
                                            } else {
                                                alert("Please enter a roll number first.");
                                            }
                                        }}
                                        className={`py-2 rounded-xl text-xs font-bold transition-colors duration-300 transform hover:scale-105 shadow-sm 
                                        ${seat.occupied ? 'bg-red-200 text-red-800 cursor-not-allowed' : 'bg-green-200 text-green-800 hover:bg-green-300'}`}
                                        disabled={seat.occupied}
                                    >
                                        {seat.id}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
                            <button onClick={() => { setShowAssignModal(false); setSelectedSeat(null); }} className="px-6 py-3 rounded-xl border border-gray-300 font-bold hover:bg-gray-100 transition-colors transform hover:scale-105">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
            {editStudentModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
                    <div className="bg-white rounded-3xl w-full max-w-lg p-8 shadow-2xl transform transition-all duration-500 scale-100">
                        <h3 className="text-xl font-bold mb-4 text-primary-gradient">Edit Student Details</h3>
                        <form onSubmit={updateStudentFromModal} className="space-y-4">
                            <div className="flex items-center space-x-4 border-b pb-4 border-gray-100">
                                <div
                                    className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500 overflow-hidden cursor-pointer relative transition-all duration-300 hover:scale-105 hover:shadow-md border-2 border-primary/50"
                                    onClick={() => photoUploadRef.current.click()}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleEditDropPhoto(e, 'photo')}
                                >
                                    {editForm.photo ? (
                                        <img src={editForm.photo} alt="Student" className="w-full h-full object-cover" />
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    )}
                                    <input type="file" ref={photoUploadRef} onChange={handleEditPhotoUpload} className="hidden" accept="image/*" />
                                </div>
                                <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500 overflow-hidden cursor-pointer relative transition-all duration-300 hover:scale-105 hover:shadow-md border-2 border-secondary/50"
                                    onClick={() => formPhotoUploadRef.current.click()}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleEditDropPhoto(e, 'formPhoto')}
                                >
                                    {editForm.formPhoto ? (
                                        <img src={editForm.formPhoto} alt="Form" className="w-full h-full object-cover" />
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5h6v14H9z" /></svg>
                                    )}
                                    <input type="file" ref={formPhotoUploadRef} onChange={handleEditFormPhotoUpload} className="hidden" accept="image/*" />
                                </div>
                            </div>
                            <input placeholder="Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-4 py-3 border rounded-xl focus:ring-primary" />
                            <input placeholder="Father's name" value={editForm.father} onChange={e => setEditForm({ ...editForm, father: e.target.value })} className="w-full px-4 py-3 border rounded-xl focus:ring-primary" />
                            <input type="number" placeholder="Aadhar No. (12 digits)" value={editForm.aadhar} onChange={e => setEditForm({ ...editForm, aadhar: e.target.value })} className="w-full px-4 py-3 border rounded-xl focus:ring-primary" maxLength="12"/>
                            <div className="flex gap-4">
                                <input type="text" pattern="[0-9]{10}" maxLength="10" placeholder="Student Mobile" value={editForm.studentMobile} onChange={e => setEditForm({ ...editForm, studentMobile: e.target.value.replace(/[^0-9]/g, '') })} className="w-1/2 px-4 py-3 border rounded-xl focus:ring-primary" />
                                <input type="text" pattern="[0-9]{10}" maxLength="10" placeholder="Parent Mobile" value={editForm.parentMobile} onChange={e => setEditForm({ ...editForm, parentMobile: e.target.value.replace(/[^0-9]/g, '') })} className="w-1/2 px-4 py-3 border rounded-xl focus:ring-primary" />
                            </div>
                            <select value={editForm.shift} onChange={e => setEditForm({ ...editForm, shift: e.target.value })} className="w-full px-4 py-3 border rounded-xl focus:ring-primary font-semibold">
                                {timeShifts.map(shift => <option key={shift.name}>{shift.name}</option>)}
                            </select>
                            <div className="flex gap-4">
                                <div className="w-1/2">
                                    <label className="block text-sm font-bold text-gray-700">Admission Date</label>
                                    <input type="date" value={editForm.admissionDate} onChange={e => setEditForm({ ...editForm, admissionDate: e.target.value })} className="w-full px-4 py-3 border rounded-xl focus:ring-primary" />
                                </div>
                                <div className="w-1/2">
                                    <label className="block text-sm font-bold text-gray-700">Fee Amount</label>
                                    <input type="number" placeholder="Fee Amount" value={editForm.feeAmount} onChange={e => setEditForm({ ...editForm, feeAmount: e.target.value })} className="w-full px-4 py-3 border rounded-xl focus:ring-primary" />
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <h4 className="font-bold text-md text-primary">Change Seat: <span className="font-black text-lg">{editForm.assignedSeat || 'N/A'}</span></h4>
                                <div className="flex gap-2 mb-2 pt-2">
                                    {Object.keys(hallsConfigState).map(hall => <button type="button" key={hall} onClick={() => setModalActiveHall(hall)} className={`px-3 py-1 text-xs rounded-full font-bold transition-all duration-300 transform hover:scale-105 ${modalActiveHall === hall ? 'bg-secondary text-white shadow-md shadow-secondary/50' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>Hall {hall}</button>)}
                                </div>
                                <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto border p-2 rounded-xl bg-gray-50">
                                    {Object.values(seats[modalActiveHall] || {}).map(seat => (
                                        <button
                                            type="button"
                                            key={seat.id}
                                            onClick={() => setEditForm({ ...editForm, assignedSeat: seat.id })}
                                            className={`py-1 rounded-lg text-xs font-bold transition-colors duration-300 transform hover:scale-105 shadow-sm 
                                            ${editForm.assignedSeat === seat.id ? 'bg-primary text-white shadow-md shadow-primary/30' : ''} 
                                            ${seat.occupied && seat.studentRoll !== editForm.roll ? 'bg-red-200 text-red-800 cursor-not-allowed' : (seat.occupied && seat.studentRoll === editForm.roll ? 'bg-green-400 text-white' : 'bg-green-200 text-green-800 hover:bg-green-300')}`}
                                            disabled={seat.occupied && seat.studentRoll !== editForm.roll}
                                        >
                                            {seat.id}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                                <button type="button" onClick={() => setEditStudentModal({ open: false, student: null })} className="px-6 py-3 border rounded-xl font-bold hover:bg-gray-100 transition-colors transform hover:scale-105">Cancel</button>
                                <button type="submit" className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors transform hover:scale-105 shadow-md shadow-primary/30">Update Record</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {editPaymentModal.open && (
                <EditPaymentModal 
                    editPaymentModal={editPaymentModal}
                    setEditPaymentModal={setEditPaymentModal}
                    updatePayment={updatePayment}
                    handleViewPhoto={handleViewPhoto}
                />
            )}

            <footer className="fixed left-0 right-0 bottom-0 p-4 bg-white border-t border-gray-200 shadow-2xl z-40">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center">
                    <div className="bg-gray-100 p-3 rounded-xl shadow-inner text-center font-bold text-sm flex-1 mb-2 sm:mb-0 transition-all duration-500 hover:bg-gray-200">
                        Total seats: <span className="font-black text-primary">{totals.total}</span> • Occupied: <span className="font-black text-red-600">{totals.occupied}</span> • Available: <span className="font-black text-green-600">{totals.available}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        {backupSuccess && (
                            <div className="flex items-center text-green-600 font-bold text-sm transition-all duration-300 transform scale-100 animate-pulse">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                {backupMessage}
                            </div>
                        )}
                        <div className="text-xs text-gray-500 font-medium">Last Backup: {formatTimeAgo(lastBackupTime)}</div>
                        <button onClick={backupData} className="ml-0 sm:ml-4 px-4 py-2 bg-secondary text-white rounded-xl text-sm font-bold shadow-lg shadow-secondary/30 hover:bg-pink-600 transition-colors transform hover:scale-105">Backup Now</button>
                    </div>
                </div>
            </footer>

            {/* Chatbot Button */}
            <button onClick={() => setChatbotOpen(!chatbotOpen)} className="chatbot-button">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
            </button>

            {/* Chatbot Modal */}
            {chatbotOpen && (
                <div className="chatbot-modal">
                    <div className="chatbot-header">
                        <span>Student Inquiry Bot</span>
                        <button onClick={() => setChatbotOpen(false)} className="text-white hover:text-gray-300">&times;</button>
                    </div>
                    <div className="chatbot-messages flex flex-col">
                        {chatMessages.map((msg, idx) => (
                            <div key={idx} className={`chatbot-message ${msg.sender}`} style={{ whiteSpace: 'pre-wrap' }}>
                                {msg.text}
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handleChatSubmit} className="chatbot-input">
                        <input 
                            type="text" 
                            value={chatInput} 
                            onChange={e => setChatInput(e.target.value)} 
                            placeholder="Enter roll or 'list'..." 
                        />
                        <button type="submit">Send</button>
                    </form>
                </div>
            )}
        </div>
    );
}

function StudentDetailModal({ student, onClose, onReleaseSeat, onOpenPaymentModal, onEditStudent, formatDate, calculateStudentFinancials, isOwner, waMessageFor, togglePayments, expandedPayments, timeShifts, handleViewPhoto, toggleActive, resetStudent }) {
    const { useEffect, useState } = React;
    const [isVisible, setIsVisible] = useState(false);
    const [showAmountPaid, setShowAmountPaid] = useState(false);
    
    if (!student) return null;
    
    // Re-calculate financials inside the modal with the latest student prop
    const financials = calculateStudentFinancials(student);

    const { totalDues, paidUntil, overpaid, dueSince, daysDue, paidMonths, amountPaid } = financials;
    const isStudentOccupied = !!student.assignedSeat;
    const seat = isStudentOccupied ? { id: student.assignedSeat, hall: student.assignedSeat.charAt(0) } : null;
    const isStudentDue = totalDues > 0;
    const sortedPayments = (student.payments || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    const paymentsToShow = expandedPayments[student.roll] ? sortedPayments : sortedPayments.slice(0, 2);
    const isActive = student.active !== false;
    const studentShift = timeShifts.find(s => s.name === student.shift);
    const sortedPastHistory = (student.pastHistory || []).sort((a, b) => new Date(b.date) - new Date(a.date));

    useEffect(() => {
        setIsVisible(true); 
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    
    const handlePaymentClick = () => {
        onClose();
        onOpenPaymentModal(student.roll);
    };
    
    const handleEditClick = () => {
        onClose();
        onEditStudent(student);
    };
    
    const handleReleaseClick = () => {
        onReleaseSeat(seat, student.roll);
    };
    
    const handleToggleActive = () => {
        toggleActive(student.roll);
    };
    
    const handleResetStudent = () => {
        resetStudent(student.roll);
    };
    
    const sheetStyle = isVisible 
        ? 'translate-y-0 opacity-100' 
        : 'translate-y-full opacity-0';
    
    return (
        <div className={`fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}>
            <div 
                className={`bg-bg-light rounded-t-4xl w-full max-w-5xl h-full max-h-[95%] p-6 shadow-2xl border-t-4 border-primary/50 overflow-y-auto transform transition-transform duration-700 ease-out ${sheetStyle}`} 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center pb-4 mb-4 border-b border-gray-200 sticky top-0 bg-bg-light z-10">
                    <h2 className="text-3xl font-black text-secondary-gradient">Student Detail: <span className="text-primary">{student.name}</span></h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-600 text-4xl font-light transition-colors transform hover:scale-110">&times;</button>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="p-6 bg-white rounded-3xl shadow-lg border border-gray-100 text-center transform hover:shadow-xl transition-all duration-300">
                            <div 
                                className="w-40 h-40 mx-auto rounded-full overflow-hidden border-4 border-primary/50 shadow-xl cursor-pointer transform hover:scale-105 transition-all duration-300"
                                onClick={() => student.photo && handleViewPhoto(student.photo)}
                            >
                                {student.photo ? (
                                    <img src={student.photo} alt="Student Photo" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-primary/20 flex items-center justify-center text-4xl font-black text-primary">{(student.name || '?').charAt(0).toUpperCase()}</div>
                                )}
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 mt-4">{student.name}</h3>
                            <p className="text-sm font-semibold text-gray-500">Roll No: <span className="text-secondary font-black">{student.roll}</span></p>
                            {student.formPhoto && (
                                <button onClick={() => handleViewPhoto(student.formPhoto)} className="text-accent hover:text-accent-dark text-sm font-bold mt-2 underline transition-colors">View Form</button>
                            )}
                            <p className="text-xs text-gray-400 mt-1">Admitted on: {formatDate(student.admissionDate)}</p>
                        </div>
                        
                        <div className={`p-6 rounded-3xl shadow-lg border-l-4 transform hover:shadow-xl transition-all duration-300 ${isStudentDue ? 'bg-red-50 border-red-500' : 'bg-green-50 border-green-500'}`}>
                            <h4 className="text-xl font-black text-gray-900 mb-3">Financial Status</h4>
                            <div className="space-y-2 text-md">
                                <div className="flex justify-between font-bold"><span>Monthly Fee:</span> <span className="text-lg font-black text-primary">₹{student.feeAmount.toLocaleString('en-IN')}</span></div>
                                <div className="flex justify-between font-bold items-center">
                                    <span>Total Paid:</span> 
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg font-black text-green-600">{showAmountPaid ? `₹${financials.amountPaid.toLocaleString('en-IN')}` : '******'}</span>
                                        <button onClick={() => setShowAmountPaid(!showAmountPaid)} className="text-gray-500 hover:text-green-600 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 7.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex justify-between font-bold"><span>Valid Till:</span> <span className={`text-lg font-black ${isStudentDue ? 'text-red-600' : 'text-green-600'}`}>{formatDate(paidUntil)} ({paidMonths} months)</span></div>
                                {isStudentDue && dueSince && <div className="flex justify-between font-bold"><span>Due Since:</span> <span className="text-lg font-black text-red-600">{formatDate(dueSince)}</span></div>}
                                <div className="flex justify-between font-bold"><span>{isStudentDue ? 'Total Dues:' : 'Overpaid:'}</span> <span className={`text-2xl font-black ${isStudentDue ? 'text-red-600' : 'text-blue-600'}`}>₹{isStudentDue ? totalDues.toLocaleString('en-IN') : overpaid.toLocaleString('en-IN')}</span></div>
                                {isStudentDue && daysDue > 0 && <div className="flex justify-between font-bold"><span>Days Overdue:</span> <span className="text-xl font-black text-red-700">{daysDue}</span></div>}
                            </div>
                        </div>
                        
                        <div className="flex flex-col gap-3">
                            <button onClick={handlePaymentClick} className="px-6 py-3 bg-green-600 text-white rounded-xl font-black hover:bg-green-700 transition-colors transform hover:scale-[1.01] shadow-md shadow-green-600/40">ADD PAYMENT</button>
                            <button onClick={handleEditClick} className="px-6 py-3 bg-primary text-white rounded-xl font-black hover:bg-indigo-700 transition-colors transform hover:scale-[1.01] shadow-md shadow-primary/40">EDIT DETAILS</button>
                            {isStudentOccupied && <button onClick={handleReleaseClick} className="px-6 py-3 bg-red-600 text-white rounded-xl font-black hover:bg-red-700 transition-colors transform hover:scale-[1.01] shadow-md shadow-red-600/40">RELEASE SEAT {seat.id}</button>}
                            {isOwner && <button onClick={handleToggleActive} className={`px-6 py-3 rounded-xl font-black transition-colors transform hover:scale-[1.01] shadow-md ${isActive ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-600/40' : 'bg-green-600 text-white hover:bg-green-700 shadow-green-600/40'}`}>{isActive ? 'DEACTIVATE STUDENT' : 'ACTIVATE STUDENT'}</button>}
                            {isOwner && <button onClick={handleResetStudent} className="px-6 py-3 bg-purple-600 text-white rounded-xl font-black hover:bg-purple-700 transition-colors transform hover:scale-[1.01] shadow-md shadow-purple-600/40">RESET STUDENT</button>}
                            {isStudentDue && (student.studentMobile || student.parentMobile) && (
                                <a href={`https://wa.me/91${String(student.studentMobile || student.parentMobile).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waMessageFor(student))}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl font-black hover:bg-green-600 transition-colors transform hover:scale-[1.01] shadow-md shadow-green-500/40">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.549A9.957 9.957 0 0012 12m9 0a9.957 9.957 0 00-1.395-3.549L18 4l-1.395 3.549A9.957 9.957 0 0012 12m0 0l-1.395 3.549A9.957 9.957 0 0012 12z" /></svg>
                                    SEND DUES REMINDER
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                        <div className="p-6 bg-white rounded-3xl shadow-lg border border-gray-100 transform hover:shadow-xl transition-all duration-300">
                            <h4 className="text-xl font-black text-primary-gradient mb-3">General Information</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div className="p-3 bg-gray-50 rounded-xl font-semibold"><strong>Assigned Seat:</strong> <span className="font-black text-primary text-base">{student.assignedSeat || 'N/A'}</span></div>
                                <div className="p-3 bg-gray-50 rounded-xl font-semibold"><strong>Current Shift:</strong> <span className="font-black text-primary">{student.shift}</span> ({studentShift?.start} - {studentShift?.end})</div>
                                <div className="p-3 bg-gray-50 rounded-xl font-semibold"><strong>Father's Name:</strong> {student.father || 'N/A'}</div>
                                <div className="p-3 bg-gray-50 rounded-xl font-semibold"><strong>Aadhar:</strong> {student.aadhar || 'N/A'}</div>
                                <div className="p-3 bg-gray-50 rounded-xl font-semibold"><strong>Student Mobile:</strong> {student.studentMobile || 'N/A'}</div>
                                <div className="p-3 bg-gray-50 rounded-xl font-semibold"><strong>Parent Mobile:</strong> {student.parentMobile || 'N/A'}</div>
                                <div className="p-3 bg-gray-50 rounded-xl md:col-span-2 font-semibold"><strong>Admission Date:</strong> {formatDate(student.admissionDate)}</div>
                            </div>
                        </div>

                        <div className="p-6 bg-white rounded-3xl shadow-lg border border-gray-100 transform hover:shadow-xl transition-all duration-300">
                            <h4 className="text-xl font-black text-secondary-gradient mb-3">Payment History</h4>
                            {sortedPayments.length === 0 ? (
                                <p className="text-gray-500">No payment history found.</p>
                            ) : (
                                <div className="space-y-2 text-sm max-h-60 overflow-y-auto">
                                    {paymentsToShow.map((p) => (
                                        <div key={p.id} className="flex justify-between items-center bg-gray-100 p-3 rounded-xl transition-all duration-300 hover:bg-gray-200/70 transform hover:scale-[1.005]">
                                            <div>
                                                <span className="font-black text-green-700">₹{p.amount.toLocaleString('en-IN')}</span> on <span className="font-bold">{formatDate(p.date)}</span>
                                                <span className="text-xs text-gray-600 ml-2 font-semibold">({p.duration} {p.type}) ({p.method})</span>
                                                {(p.discount || 0) > 0 && <span className="text-xs text-red-500 ml-2 font-black">(Disc: ₹{p.discount.toLocaleString('en-IN')})</span>}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 font-semibold">{p.note}</span>
                                                {p.photo && <button onClick={() => handleViewPhoto(p.photo)} className="text-primary hover:text-indigo-700"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button>}
                                            </div>
                                        </div>
                                    ))}
                                    {sortedPayments.length > 2 && (
                                        <button onClick={() => togglePayments(student.roll)} className="text-xs text-primary font-bold hover:text-indigo-700 mt-2 transition-colors">
                                            {expandedPayments[student.roll] ? 'Show Less' : `Show All ${sortedPayments.length} Entries`}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        {sortedPastHistory.length > 0 && (
                            <div className="p-6 bg-white rounded-3xl shadow-lg border border-gray-100 transform hover:shadow-xl transition-all duration-300">
                                <h4 className="text-xl font-black text-secondary-gradient mb-3">Past History (Before Reset)</h4>
                                <div className="space-y-2 text-sm max-h-60 overflow-y-auto">
                                    {sortedPastHistory.map((p) => (
                                        <div key={p.id} className="flex justify-between items-center bg-gray-100 p-3 rounded-xl transition-all duration-300 hover:bg-gray-200/70 transform hover:scale-[1.005]">
                                            <div>
                                                <span className="font-black text-green-700">₹{p.amount.toLocaleString('en-IN')}</span> on <span className="font-bold">{formatDate(p.date)}</span>
                                                <span className="text-xs text-gray-600 ml-2 font-semibold">({p.duration} {p.type}) ({p.method})</span>
                                                {(p.discount || 0) > 0 && <span className="text-xs text-red-500 ml-2 font-black">(Disc: ₹{p.discount.toLocaleString('en-IN')})</span>}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 font-semibold">{p.note}</span>
                                                {p.photo && <button onClick={() => handleViewPhoto(p.photo)} className="text-primary hover:text-indigo-700"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function EditPaymentModal({ editPaymentModal, setEditPaymentModal, updatePayment, handleViewPhoto }) {
    const [localPayment, setLocalPayment] = React.useState(editPaymentModal.payment);
    
    const payment = editPaymentModal.payment;
    const originalDiscount = payment.discount || 0;
    const originalFinalAmount = payment.amount;
    const originalPreDiscountAmount = originalFinalAmount + originalDiscount;

    const handleChange = (field, value) => {
        setLocalPayment(prev => ({ ...prev, [field]: value }));
    };

    const handleUpdate = () => {
        updatePayment(editPaymentModal.studentRoll, localPayment.id, localPayment);
    };
    
    const currentDiscount = localPayment.discount || 0;
    const currentFinalAmount = localPayment.amount;

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const compressedPhoto = await compressImage(reader.result);
                handleChange('photo', compressedPhoto);
            };
            reader.readAsDataURL(file);
        }
    };
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
            <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl transform transition-all duration-500 scale-100">
                <h3 className="text-xl font-bold mb-4 text-secondary-gradient">Edit Payment for {editPaymentModal.studentRoll}</h3>
                <div className="space-y-4">
                    <label className="block text-sm font-bold text-gray-700">Payment Date</label>
                    <input
                        type="date"
                        value={localPayment.date.split('T')[0]}
                        onChange={e => handleChange('date', new Date(e.target.value).toISOString())}
                        className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-600 transition-all duration-300"
                    />
                    
                    <div className="text-md font-semibold text-gray-600 p-3 bg-purple-100 rounded-xl border border-purple-300">
                        Original Pre-Discount Fee: <span className="text-lg font-black text-primary">₹{originalPreDiscountAmount.toLocaleString('en-IN')}</span>
                    </div>

                    <label className="block text-sm font-bold text-gray-700">Discount Amount</label>
                    <input
                        type="number"
                        placeholder="Discount Amount"
                        value={currentDiscount}
                        onChange={e => {
                            const newDiscount = Number(e.target.value);
                            handleChange('discount', newDiscount);
                            handleChange('amount', originalPreDiscountAmount - newDiscount); 
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-red-600 transition-all duration-300"
                    />

                    <label className="block text-sm font-bold text-gray-700">Final Amount Received</label>
                    <input
                        type="number"
                        placeholder="Final Amount Received"
                        value={currentFinalAmount}
                        onChange={e => {
                            const newAmount = Number(e.target.value);
                            handleChange('amount', newAmount);
                            handleChange('discount', originalPreDiscountAmount - newAmount);
                        }}
                        className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-600 transition-all duration-300"
                    />
                    
                    <label className="block text-sm font-bold text-gray-700">Duration (for record)</label>
                    <div className="flex gap-4 items-center">
                        <input
                            type="number"
                            placeholder="Duration"
                            value={localPayment.duration}
                            onChange={e => handleChange('duration', Number(e.target.value))}
                            className="w-1/2 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-600 transition-all duration-300"
                        />
                        <select
                            value={localPayment.type}
                            onChange={e => handleChange('type', e.target.value)}
                            className="w-1/2 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-600 transition-all duration-300 font-semibold"
                        >
                            <option value="month">Months</option>
                            <option value="day">Days</option>
                        </select>
                    </div>
                    <label className="block text-sm font-bold text-gray-700">Payment Method</label>
                    <select value={localPayment.method} onChange={e => handleChange('method', e.target.value)} className="w-full px-4 py-3 border rounded-xl focus:ring-green-600 font-semibold">
                        <option value="cash">Cash</option>
                        <option value="online">Online</option>
                    </select>
                    <label className="block text-sm font-bold text-gray-700">Bill Photo</label>
                    <input type="file" onChange={handlePhotoUpload} accept="image/*" className="w-full px-4 py-3 border rounded-xl focus:ring-primary" />
                    {localPayment.photo && <button type="button" onClick={() => handleViewPhoto(localPayment.photo)} className="px-4 py-2 text-sm rounded-lg font-semibold bg-secondary text-white hover:bg-pink-700 shadow-md shadow-secondary/30">View Bill Photo</button>}
                    <input
                        placeholder="Note (optional)"
                        value={localPayment.note}
                        onChange={e => handleChange('note', e.target.value)}
                        className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-600 transition-all duration-300"
                    />
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
                        <button onClick={() => setEditPaymentModal({ open: false, studentRoll: null, paymentIndex: null, payment: null })} className="px-6 py-3 rounded-xl border border-gray-300 font-bold hover:bg-gray-100 transition-colors transform hover:scale-105">Cancel</button>
                        <button onClick={handleUpdate} className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors transform hover:scale-105 shadow-md shadow-primary/30">Update Payment</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AuthScreenEnhanced({ users, onLogin, onRequestReset, onReset, setStudents, setSeats, setActivities, setUsers, setTimeShifts, setHallsConfigState, setLibraryName, setAttendance }) {
    const { useState } = React;
    const [tab, setTab] = useState('login');
    const [lu, setLu] = useState(''); const [lp, setLp] = useState('');
    const [fu, setFu] = useState(''); const [fq, setFq] = useState(''); const [fa, setFa] = useState(''); const [fn, setFn] = useState('');

    const handleImportBackup = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData.students && importedData.seats) {
                    for (const roll in importedData.students) {
                        importedData.students[roll].payments = importedData.students[roll].payments?.map(p => ({ ...p, discount: p.discount || 0, method: p.method || 'cash' })) || [];
                        importedData.students[roll].assignedAt = importedData.students[roll].assignedAt || null;
                        importedData.students[roll].active = importedData.students[roll].active !== false;
                        importedData.students[roll].feeChanges = importedData.students[roll].feeChanges || [];
                        importedData.students[roll].formPhoto = importedData.students[roll].formPhoto || '';
                        importedData.students[roll].deactivatedAt = importedData.students[roll].deactivatedAt || null;
                        importedData.students[roll].pastHistory = importedData.students[roll].pastHistory || [];
                    }
                    
                    setStudents(importedData.students);
                    setSeats(importedData.seats);
                    setActivities(importedData.activities || []);
                    setUsers(importedData.users || {});
                    setTimeShifts(importedData.timeShifts || []);
                    setHallsConfigState(importedData.hallsConfigState || {});
                    setLibraryName(importedData.libraryName || 'MAGADH LIBRARY');
                    setAttendance(importedData.attendance || {});
                    alert('Backup imported successfully! Login with the imported credentials.');
                } else {
                    alert('Invalid backup file structure.');
                }
            } catch (error) {
                alert('Error parsing file.');
                console.error('Import error:', error);
            }
        };
        reader.readAsText(file);
    };

    const handleLogin = () => { onLogin({ username: lu, password: lp }); };
    const handleRequestReset = () => { const q = onRequestReset(fu); if (q) setFq(q); };
    const handleReset = () => { onReset(fu, fa, fn); };
    
    return (
        <div className="flex items-center justify-center min-h-screen bg-bg-light p-4">
            <div className="bg-white p-8 rounded-4xl shadow-2xl w-full max-w-md border-4 border-primary/10 transform hover:shadow-primary/20 transition-all duration-500">
                <h1 className="text-6xl font-black text-center text-primary-gradient mb-6 tracking-wider">MAGADH</h1>
                <p className="text-center text-gray-500 mb-6 font-semibold">Student Seat & Fee Management</p>

                <div className="flex justify-center mb-6 border-b border-gray-200">
                    <button onClick={() => setTab('login')} className={`px-5 py-3 rounded-t-xl font-black text-lg transition-all duration-300 transform hover:scale-[1.01] ${tab === 'login' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-gray-600 hover:text-primary'}`}>Login</button>
                    <button onClick={() => setTab('reset')} className={`px-5 py-3 rounded-t-xl font-black text-lg transition-all duration-300 transform hover:scale-[1.01] ${tab === 'reset' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-gray-600 hover:text-primary'}`}>Reset</button>
                </div>
                {tab === 'login' && (
                    <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-5">
                        <input type="text" placeholder="Username (MAGADH)" value={lu} onChange={(e) => setLu(e.target.value.toUpperCase())} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-300" />
                        <input type="password" placeholder="Password" value={lp} onChange={(e) => setLp(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-300" />
                        <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-black text-lg hover:bg-indigo-700 transition-colors transform hover:scale-[1.01] shadow-xl shadow-primary/30">Login to Dashboard</button>
                        <div className="mt-4 flex flex-col items-center pt-4 border-t border-gray-100">
                            <label className="text-sm cursor-pointer text-secondary font-black hover:text-pink-600 transition-colors transform hover:scale-105">
                                Import Data from Backup
                                <input type="file" className="hidden" accept=".json" onChange={handleImportBackup} />
                            </label>
                            <p className="text-xs text-gray-400 mt-2 font-semibold">Imports data and sets the file as the automatic backup target.</p>
                        </div>
                    </form>
                )}
                {tab === 'reset' && (
                    <div className="space-y-4">
                        <input type="text" placeholder="Username" value={fu} onChange={(e) => setFu(e.target.value.toUpperCase())} className="w-full px-4 py-3 border rounded-xl focus:ring-primary transition-all duration-300" />
                        <button onClick={handleRequestReset} className="w-full bg-gray-500 text-white py-3 rounded-xl font-bold hover:bg-gray-600 transition-colors transform hover:scale-[1.01]">Get Security Question</button>
                        {fq && <p className="text-center font-bold mt-4 text-primary p-2 bg-purple-50 rounded-xl">{fq}</p>}
                        {fq && (
                            <>
                                <input type="text" placeholder="Your Answer" value={fa} onChange={(e) => setFa(e.target.value)} className="w-full px-4 py-3 border rounded-xl focus:ring-primary transition-all duration-300" />
                                <input type="password" placeholder="New Password" value={fn} onChange={(e) => setFn(e.target.value)} className="w-full px-4 py-3 border rounded-xl focus:ring-primary transition-all duration-300" />
                                <button onClick={handleReset} className="w-full bg-red-600 text-white py-3 rounded-xl font-black hover:bg-red-700 transition-colors transform hover:scale-[1.01] shadow-xl shadow-red-600/30">Reset Password</button>
                            </>
                        )}
                    </div>
                )}
                <p className="text-xs text-gray-400 mt-6 text-center font-semibold">Version {VERSION}</p>
            </div>
        </div>
    );
}

ReactDOM.render(<App />, document.getElementById('root'));