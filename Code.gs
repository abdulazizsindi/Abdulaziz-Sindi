
/**
 * نظام الرقابة والمصادرة البلدية - Backend
 */

const SS_NAME = "Municipal_Confiscations";
const FOLDER_NAME = "Inspection_Photos";

// دالة التشغيل الرئيسية
function doGet() {
  setupDatabase();
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('نظام الرقابة البلدية المحوكم')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// تهيئة الجداول والمجلدات
function setupDatabase() {
  const files = DriveApp.getFilesByName(SS_NAME);
  let ss;
  if (!files.hasNext()) {
    ss = SpreadsheetApp.create(SS_NAME);
    const sheets = ['users', 'visits', 'audit_logs'];
    sheets.forEach(name => {
      if (!ss.getSheetByName(name)) ss.insertSheet(name);
    });
    ss.deleteSheet(ss.getSheetByName('Sheet1'));

    // الرؤوس
    ss.getSheetByName('users').appendRow(['id', 'fullName', 'username', 'passwordHash', 'role', 'parentId', 'isActive', 'createdAt', 'lastLoginAt']);
    ss.getSheetByName('visits').appendRow(['visitId', 'inspectionNumber', 'inspectorId', 'inspectorName', 'supervisorId', 'mosqueName', 'confiscationType', 'lat', 'lng', 'photoFileIds', 'createdAt', 'status', 'supervisorNote', 'followUpNote']);
    ss.getSheetByName('audit_logs').appendRow(['id', 'userId', 'userName', 'action', 'details', 'createdAt']);

    // المستخدمين الافتراضيين
    createInitialUser(ss, 'مدير الإدارة', '9999', '999999', 'DIRECTOR', '');
    createInitialUser(ss, 'المتابعة', '8888', '888888', 'FOLLOW_UP', '');
    createInitialUser(ss, 'مشرف ميداني', '1234', '123456', 'SUPERVISOR', '');
  }
  
  if (!DriveApp.getFoldersByName(FOLDER_NAME).hasNext()) {
    DriveApp.createFolder(FOLDER_NAME);
  }
}

function createInitialUser(ss, name, user, pass, role, parent) {
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pass)
                .map(b => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
  ss.getSheetByName('users').appendRow([Utilities.getUuid(), name, user, hash, role, parent, true, new Date(), '']);
}

// التحقق من الدخول
function authenticateUser(username, passwordHash) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = ss.getSheetByName('users').getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] == username && data[i][3] == passwordHash) {
      if (!data[i][6]) throw new Error("الحساب معطل حالياً");
      const user = { id: data[i][0], fullName: data[i][1], role: data[i][4], parentId: data[i][5] };
      ss.getSheetByName('users').getRange(i + 1, 9).setValue(new Date());
      logAudit(user.id, user.fullName, "LOGIN", "تسجيل دخول ناجح");
      return user;
    }
  }
  throw new Error("بيانات الدخول غير صحيحة");
}

// إنشاء مستخدم
function createUser(creator, userData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('users');
  const values = sheet.getDataRange().getValues();
  
  if (values.some(r => r[2] == userData.username)) throw new Error("اسم المستخدم محجوز مسبقاً");
  
  sheet.appendRow([
    Utilities.getUuid(),
    userData.fullName,
    userData.username,
    userData.passwordHash,
    userData.role,
    userData.parentId || '',
    true,
    new Date(),
    ''
  ]);
  logAudit(creator.id, creator.fullName, "CREATE_USER", `إنشاء حساب: ${userData.username} (${userData.role})`);
  return true;
}

// حفظ الزيارة
function saveVisit(inspector, visitData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('visits');
  
  // حوكمة GPS
  const tenMinutes = 10 * 60 * 1000;
  const now = new Date();
  const logs = sheet.getDataRange().getValues();
  for (let i = logs.length - 1; i >= 1; i--) {
    const diff = now - new Date(logs[i][10]);
    if (diff > tenMinutes) break;
    if (logs[i][7] == visitData.lat && logs[i][8] == visitData.lng) {
      throw new Error("لا يمكن تسجيل زيارة بنفس الموقع خلال 10 دقائق (منع تكرار)");
    }
  }

  // رفع الصور
  const folder = DriveApp.getFoldersByName(FOLDER_NAME).next();
  const fileIds = visitData.photos.map((base64, idx) => {
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', `img_${Date.now()}_${idx}.jpg`);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getId();
  });

  const inspectionNumber = "REC-" + (1000 + sheet.getLastRow());
  sheet.appendRow([
    Utilities.getUuid(),
    inspectionNumber,
    inspector.id,
    inspector.fullName,
    inspector.parentId,
    visitData.mosqueName,
    visitData.confiscationType,
    visitData.lat,
    visitData.lng,
    fileIds.join(','),
    now,
    'PENDING',
    '',
    ''
  ]);

  logAudit(inspector.id, inspector.fullName, "CREATE_VISIT", `تسجيل ضبط جديد: ${inspectionNumber}`);
  return { ref: inspectionNumber };
}

// جلب بيانات لوحة التحكم
function getDashboardData(user) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const visitSheet = ss.getSheetByName('visits');
  const userSheet = ss.getSheetByName('users');
  
  const allVisits = visitSheet.getDataRange().getValues();
  const filteredVisits = [];
  
  for (let i = 1; i < allVisits.length; i++) {
    const v = allVisits[i];
    const visitObj = {
      id: v[0], ref: v[1], inspectorId: v[2], inspector: v[3], supervisorId: v[4],
      site: v[5], type: v[6], lat: v[7], lng: v[8], photos: v[9].split(','),
      date: v[10], status: v[11], supervisorNote: v[12], followUpNote: v[13]
    };

    // فلترة الحوكمة
    if (user.role === 'DIRECTOR' || user.role === 'FOLLOW_UP') {
      filteredVisits.push(visitObj);
    } else if (user.role === 'SUPERVISOR' && visitObj.supervisorId === user.id) {
      filteredVisits.push(visitObj);
    } else if (user.role === 'INSPECTOR' && visitObj.inspectorId === user.id) {
      filteredVisits.push(visitObj);
    }
  }

  let users = [];
  if (user.role === 'DIRECTOR' || user.role === 'FOLLOW_UP') {
    const allUsers = userSheet.getDataRange().getValues();
    users = allUsers.slice(1).map(u => ({ id: u[0], name: u[1], username: u[2], role: u[4], active: u[6] }));
  }

  return { visits: filteredVisits, users: users };
}

// تحديث الحالة
function updateStatus(user, visitId, status, note) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('visits');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == visitId) {
      if (user.role === 'SUPERVISOR') {
        sheet.getRange(i + 1, 12).setValue(status);
        sheet.getRange(i + 1, 13).setValue(note);
      } else if (user.role === 'FOLLOW_UP') {
        sheet.getRange(i + 1, 14).setValue(note);
      }
      logAudit(user.id, user.fullName, "UPDATE_STATUS", `تحديث حالة الضبط ${data[i][1]} إلى ${status}`);
      return true;
    }
  }
}

function logAudit(userId, userName, action, details) {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('audit_logs')
    .appendRow([Utilities.getUuid(), userId, userName, action, details, new Date()]);
}
