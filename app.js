/**
 * نظام الرقابة والمصادرة البلدية - JavaScript Web App
 */

let currentUser = null;
let currentData = { visits: [], users: [] };
let gpsWatchId = null;

// --- الدوال العامة (Global Scope) ---

/**
 * دالة تسجيل الدخول الرئيسية
 * تم تعريفها في النطاق العام كما هو مطلوب
 */
async function handleLogin() {
  console.log("Login clicked");
  const userEl = document.getElementById("username");
  const passEl = document.getElementById("password");
  
  if (!userEl || !passEl) return;

  const username = userEl.value.trim();
  const password = passEl.value.trim();

  if (!username || !password) {
    return Swal.fire("تنبيه", "يرجى إدخال اسم المستخدم وكلمة المرور", "warning");
  }

  showLoading("جاري التحقق من الهوية...");

  try {
    const passwordHash = await hashString(password);
    
    // فحص وجود بيئة Google Apps Script
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(user => {
          if (user) {
            currentUser = user;
            initApp();
            Swal.close();
          } else {
             Swal.fire("فشل الدخول", "بيانات الدخول غير صحيحة", "error");
          }
        })
        .withFailureHandler(err => {
          Swal.fire("فشل الدخول", err.message, "error");
        })
        .authenticateUser(username, passwordHash);
    } else {
      console.error("google.script.run is not defined");
      // وضع تجريبي (اختياري للبيئات المحلية)
      // Swal.fire("تنبيه", "الارتباط بخادم Google Sheets غير متوفر حالياً", "info");
      Swal.close();
    }
      
  } catch (e) {
    console.error(e);
    Swal.fire("خطأ", "حدث خطأ غير متوقع", "error");
  }
}

// جعل الدالة متاحة عالمياً (Redundant check)
window.handleLogin = handleLogin;

/**
 * تهيئة التطبيق بعد الدخول
 */
function initApp() {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");
  
  document.getElementById("user-display-name").textContent = currentUser.fullName;
  document.getElementById("user-display-role").textContent = getRoleLabel(currentUser.role);
  
  if (currentUser.role === 'INSPECTOR') {
    document.getElementById("btn-new-visit").classList.remove("hidden");
    startGPS();
  }
  
  if (['DIRECTOR', 'FOLLOW_UP'].includes(currentUser.role)) {
    document.getElementById("btn-show-users").classList.remove("hidden");
  }
  
  refreshAllData();
}

/**
 * تحديث البيانات
 */
function refreshAllData() {
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(data => {
        currentData = data;
        renderVisits();
        renderUsers();
      })
      .getDashboardData(currentUser);
  }
}

/**
 * عرض الزيارات
 */
function renderVisits() {
  const tbody = document.getElementById("visits-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  if (!currentData.visits || currentData.visits.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-400">لا توجد سجلات حالياً</td></tr>';
    return;
  }
  
  currentData.visits.forEach(v => {
    const row = document.createElement("tr");
    row.className = "hover:bg-gray-50 transition-colors border-b border-gray-50";
    row.innerHTML = `
      <td class="p-4 font-bold text-emerald-700 text-right">${v.ref}</td>
      <td class="p-4 text-gray-600 font-semibold text-right">${v.site}</td>
      <td class="p-4 text-xs text-gray-500 text-right">${v.inspector}</td>
      <td class="p-4 text-right">
        <span class="px-2 py-1 rounded-full text-[10px] font-bold ${getStatusClass(v.status)}">${v.status}</span>
      </td>
      <td class="p-4 text-right">
        <button onclick="viewVisitDetail('${v.id}')" class="text-blue-500 hover:bg-blue-50 p-2 rounded-lg"><i class="fas fa-eye"></i></button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

/**
 * عرض المستخدمين
 */
function renderUsers() {
  const container = document.getElementById("users-list-container");
  if (!container) return;
  container.innerHTML = "";
  
  if (!currentData.users) return;

  currentData.users.forEach(u => {
    const card = document.createElement("div");
    card.className = "flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100";
    card.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="bg-white w-10 h-10 rounded-full flex items-center justify-center border text-emerald-600">
           <i class="fas fa-user"></i>
        </div>
        <div>
          <p class="font-bold text-gray-800">${u.name}</p>
          <p class="text-[10px] text-gray-500">${getRoleLabel(u.role)} | @${u.username}</p>
        </div>
      </div>
      <span class="w-2 h-2 rounded-full ${u.active ? 'bg-green-500' : 'bg-red-500'}"></span>
    `;
    container.appendChild(card);
  });
}

/**
 * حفظ الزيارة
 */
async function saveVisit() {
  const site = document.getElementById("v-mosque").value.trim();
  const type = document.getElementById("v-type").value;
  const lat = document.getElementById("v-lat").value;
  const lng = document.getElementById("v-lng").value;
  const photoInput = document.getElementById("v-photos");
  
  if (!site || !type || !photoInput.files || photoInput.files.length === 0 || !lat) {
    return Swal.fire("بيانات ناقصة", "يرجى التأكد من الموقع، نوع المصادرة، الصور، ووصول الـ GPS", "error");
  }

  showLoading("جاري رفع البيانات والتوثيق...");

  try {
    const photos = [];
    for (let i = 0; i < photoInput.files.length; i++) {
      const b64 = await fileToBase64(photoInput.files[i]);
      photos.push(b64.split(',')[1]);
    }

    const payload = {
      mosqueName: site,
      confiscationType: type,
      lat: lat,
      lng: lng,
      photos: photos
    };

    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(res => {
          Swal.fire("تم التسجيل", `تم حفظ الضبط بنجاح تحت رقم: ${res.ref}`, "success");
          document.getElementById("visitForm").reset();
          document.getElementById("photo-status").textContent = "";
          showSection('visits');
          refreshAllData();
        })
        .withFailureHandler(err => {
          Swal.fire("خطأ", err.message, "error");
        })
        .saveVisit(currentUser, payload);
    }

  } catch (e) {
    Swal.fire("خطأ", "فشل في معالجة الصور", "error");
  }
}

// --- ربط الأحداث (DOMContentLoaded) ---
// تم الالتزام بالكود المطلوب من المستخدم بدقة لضمان عمل الزر

document.addEventListener("DOMContentLoaded", function () {
  var btn = document.getElementById("loginBtn");
  if (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      handleLogin();
    });
  }

  // ربط التنقل السريع
  const btnShowVisits = document.getElementById("btn-show-visits");
  if (btnShowVisits) btnShowVisits.addEventListener("click", () => showSection('visits'));

  const btnNewVisit = document.getElementById("btn-new-visit");
  if (btnNewVisit) btnNewVisit.addEventListener("click", () => showSection('new-visit'));

  const btnShowUsers = document.getElementById("btn-show-users");
  if (btnShowUsers) btnShowUsers.addEventListener("click", () => showSection('users'));

  const btnExportPdf = document.getElementById("btn-export-pdf");
  if (btnExportPdf) btnExportPdf.addEventListener("click", exportToPDF);

  const btnRefreshVisits = document.getElementById("btn-refresh-visits");
  if (btnRefreshVisits) btnRefreshVisits.addEventListener("click", refreshAllData);

  const btnLogout = document.getElementById("logoutBtn");
  if (btnLogout) btnLogout.addEventListener("click", () => location.reload());
  
  // ربط الكاميرا
  const photoTrigger = document.getElementById("photo-trigger");
  if (photoTrigger) photoTrigger.addEventListener("click", () => document.getElementById("v-photos").click());
  
  const vPhotos = document.getElementById("v-photos");
  if (vPhotos) {
    vPhotos.addEventListener("change", function(e) {
      const count = e.target.files.length;
      const statusEl = document.getElementById("photo-status");
      if (statusEl) statusEl.textContent = count > 0 ? `تم اختيار ${count} صور` : "";
    });
  }
  
  // ربط حفظ الزيارة
  const btnSaveVisit = document.getElementById("btn-save-visit");
  if (btnSaveVisit) btnSaveVisit.addEventListener("click", saveVisit);
  
  // ربط إضافة مستخدم
  const btnOpenUserModal = document.getElementById("btn-open-user-modal");
  if (btnOpenUserModal) btnOpenUserModal.addEventListener("click", openNewUserModal);
});

// --- دوال مساعدة ---

async function hashString(str) {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  const section = document.getElementById(`section-${id}`);
  if (section) section.classList.remove('hidden');
}

function startGPS() {
  if (navigator.geolocation) {
    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const latInput = document.getElementById("v-lat");
        const lngInput = document.getElementById("v-lng");
        const display = document.getElementById("v-gps-display");
        
        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;
        if (display) {
          display.innerHTML = `
            <span class="text-emerald-600 font-bold">تم تحديد الموقع: ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
            <i class="fas fa-check-circle text-emerald-500"></i>
          `;
        }
      },
      (err) => {
        const display = document.getElementById("v-gps-display");
        if (display) {
          display.innerHTML = `
            <span class="text-red-500">فشل جلب الموقع: ${err.message}</span>
            <i class="fas fa-exclamation-triangle"></i>
          `;
        }
      },
      { enableHighAccuracy: true }
    );
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

function getRoleLabel(role) {
  const map = { DIRECTOR: 'مدير الإدارة', FOLLOW_UP: 'متابعة', SUPERVISOR: 'مشرف', INSPECTOR: 'مراقب' };
  return map[role] || role;
}

function getStatusClass(status) {
  if (status === 'APPROVED') return 'bg-green-100 text-green-700';
  if (status === 'RETURNED') return 'bg-red-100 text-red-700';
  return 'bg-yellow-100 text-yellow-700';
}

function showLoading(text) {
  Swal.fire({
    title: text,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });
}

/**
 * نافذة عرض تفاصيل الزيارة
 */
window.viewVisitDetail = function(id) {
  const v = currentData.visits.find(item => item.id === id);
  if (!v) return;

  let photosHtml = v.photos.map(pId => `<img src="https://lh3.googleusercontent.com/d/${pId.trim()}" class="w-full h-32 object-cover rounded-lg border">`).join('');

  Swal.fire({
    title: `تفاصيل الضبط ${v.ref}`,
    html: `
      <div class="text-right text-sm space-y-2">
        <p><strong>الموقع:</strong> ${v.site}</p>
        <p><strong>النوع:</strong> ${v.type}</p>
        <p><strong>المراقب:</strong> ${v.inspector}</p>
        <p><strong>الإحداثيات:</strong> ${v.lat}, ${v.lng}</p>
        <div class="grid grid-cols-2 gap-2 mt-4">${photosHtml}</div>
        ${currentUser.role === 'SUPERVISOR' && v.status === 'PENDING' ? `
          <hr class="my-4">
          <label class="block font-bold mb-1">ملاحظة المشرف:</label>
          <textarea id="supervisor-note" class="w-full border rounded-lg p-2 text-xs" rows="3"></textarea>
        ` : ''}
      </div>
    `,
    showDenyButton: currentUser.role === 'SUPERVISOR' && v.status === 'PENDING',
    showConfirmButton: (currentUser.role === 'SUPERVISOR' && v.status === 'PENDING') || (currentUser.role === 'FOLLOW_UP'),
    confirmButtonText: currentUser.role === 'SUPERVISOR' ? 'اعتماد (Approve)' : 'حفظ الملاحظة',
    denyButtonText: 'إرجاع (Return)',
    confirmButtonColor: '#10b981',
    denyButtonColor: '#ef4444',
  }).then((result) => {
    if (result.isConfirmed || result.isDenied) {
      const note = document.getElementById('supervisor-note')?.value || '';
      const status = result.isConfirmed ? 'APPROVED' : 'RETURNED';
      
      showLoading("جاري التحديث...");
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(() => {
            Swal.fire("تم", "تم تحديث الحالة بنجاح", "success");
            refreshAllData();
          })
          .updateStatus(currentUser, v.id, status, note);
      }
    }
  });
};

/**
 * نافذة إضافة مستخدم جديد
 */
function openNewUserModal() {
  const supervisors = currentData.users.filter(u => u.role === 'SUPERVISOR');
  const supOptions = supervisors.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  Swal.fire({
    title: 'إضافة كادر جديد',
    html: `
      <div class="space-y-3 text-right">
        <input id="new-name" class="swal2-input m-0 w-full" placeholder="الاسم الكامل">
        <input id="new-user" class="swal2-input m-0 w-full" placeholder="اسم المستخدم">
        <input id="new-pass" type="password" class="swal2-input m-0 w-full" placeholder="كلمة المرور">
        <select id="new-role" class="swal2-input m-0 w-full">
          <option value="INSPECTOR">مراقب ميداني</option>
          ${currentUser.role === 'DIRECTOR' ? `
            <option value="SUPERVISOR">مشرف فريق</option>
            <option value="FOLLOW_UP">إدارة متابعة</option>
          ` : ''}
        </select>
        <div id="parent-area">
          <label class="text-xs font-bold block mb-1">المشرف التابع له:</label>
          <select id="new-parent" class="swal2-input m-0 w-full">
            <option value="">-- اختر المشرف --</option>
            ${supOptions}
          </select>
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'حفظ المستخدم',
    preConfirm: async () => {
      const name = document.getElementById('new-name').value;
      const user = document.getElementById('new-user').value;
      const pass = document.getElementById('new-pass').value;
      const role = document.getElementById('new-role').value;
      const parent = document.getElementById('new-parent').value;
      
      if (!name || !user || !pass) {
        Swal.showValidationMessage('يرجى تعبئة الحقول الأساسية');
        return false;
      }
      
      const hash = await hashString(pass);
      return { fullName: name, username: user, passwordHash: hash, role, parentId: parent };
    }
  }).then(result => {
    if (result.isConfirmed) {
      showLoading("جاري إنشاء الحساب...");
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(() => {
            Swal.fire("تم", "تم إضافة المستخدم بنجاح", "success");
            refreshAllData();
          })
          .withFailureHandler(err => Swal.fire("خطأ", err.message, "error"))
          .createUser(currentUser, result.value);
      }
    }
  });
}

/**
 * تصدير PDF
 */
function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  doc.text("Report: Municipal Inspections", 105, 20, { align: 'center' });
  
  const rows = currentData.visits.map(v => [
    v.ref,
    v.site,
    v.inspector,
    v.status,
    new Date(v.date).toLocaleDateString()
  ]);

  doc.autoTable({
    head: [['Ref', 'Site', 'Inspector', 'Status', 'Date']],
    body: rows,
    startY: 30,
    theme: 'grid'
  });

  doc.save(`Municipal_Report_${Date.now()}.pdf`);
}
