
// Add export to treat as module and avoid global name collisions with app.js
export {};

// Declare Swal as it is provided by an external library in the global scope
declare const Swal: any;

/**
 * Municipal Confiscation System - Core Logic
 * Built with Vanilla JS & Google Apps Script Logic Patterns
 */

// --- Global State ---
let currentUser: any = null;
let currentTab: string = 'visits';
let visits: any[] = [];
let users: any[] = [];
let auditLogs: any[] = [];
let watchId: number | null = null;

// --- Authentication Mocking (Simulating GAS interactions) ---
const mockUsers = [
    { id: '1', fullName: 'مدير النظام', username: '9999', passwordHash: '999999', role: 'DIRECTOR', isActive: true },
    { id: '2', fullName: 'أحمد المتابعة', username: '8888', passwordHash: '888888', role: 'FOLLOW_UP', isActive: true },
    { id: '3', fullName: 'عمر المشرف', username: '1234', passwordHash: '123456', role: 'SUPERVISOR', isActive: true },
    { id: '4', fullName: 'مراقب ميداني 1', username: '5678', passwordHash: '567890', role: 'INSPECTOR', isActive: true, parentId: '3' },
];

/**
 * دالة تسجيل الدخول العالمية المطلوبة
 */
(window as any).handleLogin = function() {
    console.log("Login clicked");
    const userInp = document.getElementById('username') as HTMLInputElement;
    const passInp = document.getElementById('password') as HTMLInputElement;

    const u = userInp.value.trim();
    const p = passInp.value.trim();

    if (!u || !p) {
        Swal.fire({ icon: 'warning', title: 'تنبيه', text: 'يرجى إدخال البيانات كاملة' });
        return;
    }

    // محاكاة الاتصال بـ Google Sheets
    const user = mockUsers.find(item => item.username === u && item.passwordHash === p);

    if (user) {
        if (!user.isActive) {
            Swal.fire({ icon: 'error', title: 'عفواً', text: 'هذا الحساب معطل حالياً' });
            return;
        }
        currentUser = user;
        showDashboard();
        addAuditLog(currentUser.id, 'LOGIN', 'تسجيل دخول ناجح');
    } else {
        Swal.fire({ icon: 'error', title: 'فشل الدخول', text: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Application Loaded");
    
    // ربط زر الدخول كما هو مطلوب في التعليمات
    const btn = document.getElementById('loginBtn');
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            (window as any).handleLogin();
        });
    }

    // ربط أزرار التنقل
    document.getElementById('tab-visits')?.addEventListener('click', () => switchTab('visits'));
    document.getElementById('tab-new')?.addEventListener('click', () => switchTab('new'));
    document.getElementById('tab-users')?.addEventListener('click', () => switchTab('users'));
    document.getElementById('tab-audit')?.addEventListener('click', () => switchTab('audit'));
    
    // زر الخروج
    document.getElementById('logoutBtn')?.addEventListener('click', () => location.reload());

    // زر حفظ الضبط
    document.getElementById('saveVisitBtn')?.addEventListener('click', submitVisit);

    // معالجة معاينة الصورة
    document.getElementById('v-photo')?.addEventListener('change', handlePhotoPreview);
});

// --- UI Logic ---

function showDashboard() {
    document.getElementById('login-view')?.classList.add('hidden');
    const appView = document.getElementById('app-view');
    appView?.classList.remove('hidden');

    document.getElementById('user-name-display')!.textContent = currentUser.fullName;
    document.getElementById('user-role-display')!.textContent = getRoleArabic(currentUser.role);

    // تفعيل التبويبات حسب الصلاحية
    if (currentUser.role === 'INSPECTOR') {
        document.getElementById('tab-new')?.classList.remove('hidden');
        startGpsTracking();
    }
    if (['DIRECTOR', 'FOLLOW_UP'].includes(currentUser.role)) {
        document.getElementById('tab-users')?.classList.remove('hidden');
        document.getElementById('tab-audit')?.classList.remove('hidden');
    }

    // Call local refreshData function
    refreshData();
}

function switchTab(tabId: string) {
    currentTab = tabId;
    document.querySelectorAll('.nav-active').forEach(el => el.classList.remove('nav-active'));
    document.getElementById(`tab-${tabId}`)?.classList.add('nav-active');

    document.querySelectorAll('main section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`sec-${tabId}`)?.classList.remove('hidden');
}

function getRoleArabic(role: string) {
    const roles: any = {
        'DIRECTOR': 'مدير الإدارة',
        'FOLLOW_UP': 'إدارة المتابعة',
        'SUPERVISOR': 'مشرف ميداني',
        'INSPECTOR': 'مراقب بلدية'
    };
    return roles[role] || role;
}

// --- GPS Tracking ---
function startGpsTracking() {
    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                (document.getElementById('v-lat') as HTMLInputElement).value = lat.toString();
                (document.getElementById('v-lng') as HTMLInputElement).value = lng.toString();
                
                const statusText = document.getElementById('gps-text');
                if (statusText) statusText.textContent = `تم تحديد الموقع بنجاح: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                document.getElementById('gps-pulse')?.classList.remove('animate-pulse');
                document.getElementById('gps-pulse')?.classList.add('bg-emerald-500');
            },
            (err) => {
                console.error(err);
                const statusText = document.getElementById('gps-text');
                if (statusText) statusText.textContent = "فشل تحديد الموقع. يرجى تفعيل الـ GPS";
                document.getElementById('gps-pulse')?.classList.add('bg-red-500');
            },
            { enableHighAccuracy: true }
        );
    }
}

// --- Visit Logic ---
function handlePhotoPreview(e: any) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const preview = document.getElementById('img-preview') as HTMLImageElement;
            const icon = document.querySelector('#photo-preview-container i');
            const text = document.querySelector('#photo-preview-container p');
            
            preview.src = event.target?.result as string;
            preview.classList.remove('hidden');
            icon?.classList.add('hidden');
            text?.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
}

async function submitVisit() {
    const mosque = (document.getElementById('v-mosque') as HTMLInputElement).value;
    const type = (document.getElementById('v-type') as HTMLSelectElement).value;
    const lat = (document.getElementById('v-lat') as HTMLInputElement).value;
    const lng = (document.getElementById('v-lng') as HTMLInputElement).value;
    const photo = (document.getElementById('v-photo') as HTMLInputElement).files?.[0];

    if (!mosque || !type || !photo || !lat) {
        Swal.fire({ icon: 'error', title: 'بيانات ناقصة', text: 'يرجى ملء جميع الحقول والتقاط صورة' });
        return;
    }

    // حوكمة: منع التكرار (محاكاة)
    const exists = visits.some(v => v.lat === lat && v.lng === lng && (Date.now() - v.timestamp < 600000));
    if (exists) {
        Swal.fire({ icon: 'error', title: 'تكرار ضبط', text: 'لا يمكن تسجيل زيارة لنفس الإحداثيات خلال 10 دقائق' });
        return;
    }

    Swal.fire({ title: 'جاري الإرسال...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    // محاكاة الحفظ في Sheet
    setTimeout(() => {
        const newVisit = {
            id: Math.random().toString(36).substr(2, 9),
            inspectionNumber: 'REC-' + (1000 + visits.length),
            mosqueName: mosque,
            type: type,
            lat: lat,
            lng: lng,
            inspectorName: currentUser.fullName,
            inspectorId: currentUser.id,
            supervisorId: currentUser.parentId || '3',
            status: 'PENDING',
            timestamp: Date.now(),
            photo: (document.getElementById('img-preview') as HTMLImageElement).src
        };

        visits.unshift(newVisit);
        addAuditLog(currentUser.id, 'CREATE_VISIT', `تسجيل ضبط جديد برقم ${newVisit.inspectionNumber}`);
        
        Swal.fire({ icon: 'success', title: 'تم الحفظ', text: `رقم الضبط: ${newVisit.inspectionNumber}` });
        
        // Reset Form
        (document.getElementById('visitForm') as HTMLFormElement).reset();
        document.getElementById('img-preview')?.classList.add('hidden');
        document.querySelector('#photo-preview-container i')?.classList.remove('hidden');
        document.querySelector('#photo-preview-container p')?.classList.remove('hidden');

        switchTab('visits');
        renderVisits();
    }, 1500);
}

// --- Data Rendering ---

// Fixed: Define as a local function to fix scope errors and assigned to window for global access
function refreshData() {
    renderVisits();
    renderUsers();
    renderAudit();
}
(window as any).refreshData = refreshData;

function renderVisits() {
    const container = document.getElementById('visits-list');
    if (!container) return;

    // تصفية حسب الصلاحية
    let filtered = visits;
    if (currentUser.role === 'SUPERVISOR') {
        filtered = visits.filter(v => v.supervisorId === currentUser.id);
    } else if (currentUser.role === 'INSPECTOR') {
        filtered = visits.filter(v => v.inspectorId === currentUser.id);
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="bg-white p-12 rounded-3xl border border-dashed border-gray-200 text-center">
                <i class="fas fa-folder-open text-gray-200 text-5xl mb-4"></i>
                <p class="text-gray-400">لا توجد ضبطيات مسجلة حالياً</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(v => `
        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
            <div class="w-full md:w-32 h-32 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                <img src="${v.photo}" class="w-full h-full object-cover">
            </div>
            <div class="flex-grow space-y-1 w-full text-right">
                <div class="flex justify-between">
                    <span class="text-xs font-black text-emerald-600">${v.inspectionNumber}</span>
                    <span class="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full font-bold text-gray-500">${new Date(v.timestamp).toLocaleString('ar-SA')}</span>
                </div>
                <h3 class="font-black text-gray-800">${v.mosqueName}</h3>
                <p class="text-xs text-gray-500"><i class="fas fa-box-open ml-1"></i> ${v.type}</p>
                <div class="flex gap-2 mt-2">
                    <span class="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-bold">المراقب: ${v.inspectorName}</span>
                    <span class="text-[10px] px-2 py-1 rounded font-bold ${getStatusStyle(v.status)}">${v.status === 'PENDING' ? 'قيد التدقيق' : v.status}</span>
                </div>
            </div>
            <div class="flex gap-2 w-full md:w-auto">
                ${(currentUser.role === 'SUPERVISOR' && v.status === 'PENDING') ? `
                    <button onclick="window.updateVisitStatus('${v.id}', 'APPROVED')" class="flex-1 md:flex-none bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all">اعتماد</button>
                    <button onclick="window.updateVisitStatus('${v.id}', 'RETURNED')" class="flex-1 md:flex-none bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-600 transition-all">إرجاع</button>
                ` : ''}
                <button onclick="window.viewVisitDetails('${v.id}')" class="bg-gray-100 text-gray-600 p-2.5 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 transition-all">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function getStatusStyle(status: string) {
    if (status === 'PENDING') return 'bg-yellow-50 text-yellow-700';
    if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-700';
    if (status === 'RETURNED') return 'bg-red-50 text-red-700';
    return '';
}

(window as any).updateVisitStatus = (id: string, status: string) => {
    const v = visits.find(item => item.id === id);
    if (v) {
        v.status = status;
        addAuditLog(currentUser.id, 'UPDATE_STATUS', `تحديث حالة الضبط ${v.inspectionNumber} إلى ${status}`);
        renderVisits();
        Swal.fire({ icon: 'success', title: 'تم التحديث', text: 'تم تغيير حالة الضبط بنجاح' });
    }
};

(window as any).viewVisitDetails = (id: string) => {
    const v = visits.find(item => item.id === id);
    if (v) {
        Swal.fire({
            title: v.inspectionNumber,
            html: `
                <div class="text-right text-sm space-y-3">
                    <img src="${v.photo}" class="w-full h-48 object-cover rounded-xl mb-4 border">
                    <p><strong>الموقع:</strong> ${v.mosqueName}</p>
                    <p><strong>النوع:</strong> ${v.type}</p>
                    <p><strong>المراقب:</strong> ${v.inspectorName}</p>
                    <p><strong>الإحداثيات:</strong> ${v.lat} , ${v.lng}</p>
                    <p><strong>الحالة:</strong> ${v.status}</p>
                </div>
            `,
            confirmButtonText: 'إغلاق',
            confirmButtonColor: '#10b981'
        });
    }
};

function renderUsers() {
    const container = document.getElementById('users-list');
    if (!container) return;

    container.innerHTML = mockUsers.map(u => `
        <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    ${u.fullName.charAt(0)}
                </div>
                <div>
                    <h4 class="text-sm font-bold text-gray-800">${u.fullName}</h4>
                    <p class="text-[10px] text-gray-400">@${u.username} | ${getRoleArabic(u.role)}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-red-500'}"></span>
                <button class="text-gray-300 hover:text-emerald-500"><i class="fas fa-ellipsis-vertical"></i></button>
            </div>
        </div>
    `).join('');
}

function renderAudit() {
    const container = document.getElementById('audit-list');
    if (!container) return;

    container.innerHTML = auditLogs.map(log => `
        <tr class="border-b last:border-0 hover:bg-gray-50/50">
            <td class="p-4 font-bold text-gray-600">${log.userName}</td>
            <td class="p-4">
                <span class="text-[10px] bg-gray-100 px-2 py-0.5 rounded font-bold">${log.action}</span>
                <p class="text-xs text-gray-400 mt-1">${log.details}</p>
            </td>
            <td class="p-4 text-[10px] text-gray-400 font-bold">${new Date(log.timestamp).toLocaleTimeString('ar-SA')}</td>
        </tr>
    `).join('');
}

// --- Audit Logging ---
function addAuditLog(userId: string, action: string, details: string) {
    const u = mockUsers.find(item => item.id === userId);
    auditLogs.unshift({
        id: Math.random().toString(36).substr(2, 9),
        userId,
        userName: u ? u.fullName : 'نظام',
        action,
        details,
        timestamp: Date.now()
    });
}

// --- PDF Generation ---
// Fixed: Defined as a named function and assigned to window to fix 'Duplicate function implementation' errors
function generatePDF() {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.text("Municipal Confiscation Report", 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Generated by: ${currentUser.fullName}`, 20, 30);
    doc.text(`Date: ${new Date().toLocaleString()}`, 20, 35);
    
    const tableData = visits.map(v => [
        v.inspectionNumber,
        v.mosqueName,
        v.type,
        v.inspectorName,
        v.status,
        new Date(v.timestamp).toLocaleDateString()
    ]);

    (doc as any).autoTable({
        head: [['#Ref', 'Location', 'Type', 'Inspector', 'Status', 'Date']],
        body: tableData,
        startY: 45,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] }
    });

    doc.save(`Municipal_Report_${Date.now()}.pdf`);
    addAuditLog(currentUser.id, 'EXPORT_PDF', 'تصدير تقرير PDF عام');
}
(window as any).generatePDF = generatePDF;

// Fixed: Defined as a named function and assigned to window
function showAddUserModal() {
    Swal.fire({
        title: 'إضافة موظف جديد',
        html: `
            <input id="swal-name" class="swal2-input" placeholder="الاسم الكامل">
            <input id="swal-user" class="swal2-input" placeholder="اسم المستخدم">
            <input id="swal-pass" class="swal2-input" type="password" placeholder="كلمة المرور">
            <select id="swal-role" class="swal2-input">
                <option value="INSPECTOR">مراقب</option>
                <option value="SUPERVISOR">مشرف</option>
                <option value="FOLLOW_UP">متابعة</option>
            </select>
        `,
        confirmButtonText: 'حفظ',
        preConfirm: () => {
            return {
                name: (document.getElementById('swal-name') as HTMLInputElement).value,
                user: (document.getElementById('swal-user') as HTMLInputElement).value,
                pass: (document.getElementById('swal-pass') as HTMLInputElement).value,
                role: (document.getElementById('swal-role') as HTMLSelectElement).value
            }
        }
    }).then((result: any) => {
        if (result.isConfirmed) {
            const data = result.value;
            mockUsers.push({
                id: Math.random().toString(),
                fullName: data.name,
                username: data.user,
                passwordHash: data.pass,
                role: data.role,
                isActive: true
            });
            renderUsers();
            addAuditLog(currentUser.id, 'CREATE_USER', `إنشاء حساب للموظف ${data.name}`);
            Swal.fire('تم', 'تمت إضافة الموظف بنجاح', 'success');
        }
    });
}
(window as any).showAddUserModal = showAddUserModal;
