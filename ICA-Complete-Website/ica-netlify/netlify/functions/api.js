const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN   = process.env.ADMIN_TOKEN;

function cors(body, status) {
  return {
    statusCode: status || 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function isAdmin(headers) {
  const t = headers['x-admin-token'] || headers['X-Admin-Token'] || '';
  return ADMIN_TOKEN && t === ADMIN_TOKEN;
}

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return cors({ success: false, error: 'Server not configured. Please set environment variables.' }, 500);
  }

  const action = event.queryStringParameters && event.queryStringParameters.action || '';
  const method = event.httpMethod;
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch(e) {}

  const db = sb();

  try {

    // ── PUBLIC: Get notices ──
    if (action === 'get_notices' && method === 'GET') {
      const { data, error } = await db.from('ica_notices').select('*').order('created_at', { ascending: false }).limit(10);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data: data || [] });
    }

    // ── PUBLIC: Get admission status ──
    if (action === 'admission_status' && method === 'GET') {
      const { data } = await db.from('ica_settings').select('value').eq('key', 'admission_open').maybeSingle();
      return cors({ success: true, open: data ? data.value === 'true' : false });
    }

    // ── PUBLIC: Get site settings (year, theme colors) ──
    if (action === 'get_settings' && method === 'GET') {
      const { data } = await db.from('ica_settings').select('key, value');
      const map = {};
      (data || []).forEach(r => { map[r.key] = r.value; });
      return cors({ success: true, data: map });
    }

    // ── PUBLIC: Get active admission form schema (dynamic fields) ──
    if (action === 'get_form_schema' && method === 'GET') {
      const formKey = (event.queryStringParameters && event.queryStringParameters.form_key) || 'admission';
      const { data, error } = await db.from('ica_form_schema')
        .select('*').eq('form_key', formKey).eq('is_active', true)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data: data || null });
    }

    // ── PUBLIC: List all active custom (non-admission) forms for the website ──
    if (action === 'get_active_forms' && method === 'GET') {
      const { data, error } = await db.from('ica_form_schema')
        .select('id, form_key, title, updated_at')
        .eq('is_active', true).neq('form_key', 'admission')
        .order('updated_at', { ascending: false });
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data: data || [] });
    }

    // ── PUBLIC: Submit a generic custom form ──
    if (action === 'submit_form' && method === 'POST') {
      const { form_key, data: formData } = body;
      if (!form_key || !formData) return cors({ success: false, error: 'Missing form data' }, 400);
      const { data: schemaRow } = await db.from('ica_form_schema').select('is_active').eq('form_key', form_key).maybeSingle();
      if (!schemaRow || !schemaRow.is_active) {
        return cors({ success: false, error: 'This form is not currently accepting responses.' }, 403);
      }
      const { data, error } = await db.from('ica_form_submissions').insert({ form_key, data_json: formData, status: 'New' }).select().single();
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data });
    }

    // ── Helper: upload base64 file to Supabase Storage, returns public URL ──
    async function uploadDoc(base64, folder, filename) {
      if (!base64 || typeof base64 !== 'string' || !base64.startsWith('data:')) return '';
      const match = base64.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return '';
      const mime = match[1];
      const buf = Buffer.from(match[2], 'base64');
      const ext = (mime.split('/')[1] || 'bin').replace('jpeg', 'jpg');
      const path = folder + '/' + filename + '.' + ext;
      const { error } = await db.storage.from('admission-docs').upload(path, buf, { contentType: mime, upsert: true });
      if (error) { console.error('Upload error:', error.message); return ''; }
      const { data: pub } = db.storage.from('admission-docs').getPublicUrl(path);
      return pub ? pub.publicUrl : '';
    }

    // ── PUBLIC: Submit enquiry ──
    if (action === 'submit_enquiry' && method === 'POST') {
      const { parent_name, child_name, phone, class: cls, area, enquiry_type, message } = body;
      if (!parent_name || !child_name || !phone || !cls) {
        return cors({ success: false, error: 'Required fields missing' }, 400);
      }
      if (!/^\d{10}$/.test(phone)) {
        return cors({ success: false, error: 'Phone must be 10 digits' }, 400);
      }
      const { data, error } = await db.from('ica_enquiries').insert({
        parent_name, child_name, phone, class: cls, area: area || '',
        enquiry_type: enquiry_type || 'New Admission',
        message: message || '', status: 'New'
      }).select().single();
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data });
    }

    // ── PUBLIC: Submit admission ──
    if (action === 'submit_admission' && method === 'POST') {
      const { data: setting } = await db.from('ica_settings').select('value').eq('key', 'admission_open').maybeSingle();
      if (!setting || setting.value !== 'true') {
        return cors({ success: false, error: 'Admissions are currently closed.' }, 403);
      }
      if (!body.student_name || !body.contact_phone || !body.applying_class) {
        return cors({ success: false, error: 'Required fields missing' }, 400);
      }

      // Get academic year setting (used for app number + folder)
      const { data: yearSetting } = await db.from('ica_settings').select('value').eq('key', 'admission_year').maybeSingle();
      const academicYear = (yearSetting && yearSetting.value) || String(new Date().getFullYear());
      const yearPrefix = academicYear.split('-')[0]; // "2026-27" -> "2026"

      // Generate next sequential application number for this year
      let appNumber = '';
      try {
        const { data: counterRow } = await db.from('ica_app_counters').select('last_number').eq('academic_year', academicYear).maybeSingle();
        const nextNum = (counterRow ? counterRow.last_number : 0) + 1;
        await db.from('ica_app_counters').upsert({ academic_year: academicYear, last_number: nextNum }, { onConflict: 'academic_year' });
        appNumber = 'ICA/' + yearPrefix + '/' + String(nextNum).padStart(4, '0');
      } catch (e) { appNumber = 'ICA/' + yearPrefix + '/' + Date.now().toString().slice(-4); }

      // Folder name for this applicant's documents
      const folderSlug = (body.student_name || 'student').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now();

      // Upload all documents to Supabase Storage (only if provided)
      const [photoUrl, birthUrl, markUrl, tcUrl, aadUrl] = await Promise.all([
        uploadDoc(body.photo_url, folderSlug, 'photo'),
        uploadDoc(body.doc_birth_cert, folderSlug, 'birth_cert'),
        uploadDoc(body.doc_marksheet, folderSlug, 'marksheet'),
        uploadDoc(body.doc_tc, folderSlug, 'tc'),
        uploadDoc(body.doc_aadhaar, folderSlug, 'aadhaar')
      ]);

      const { data, error } = await db.from('ica_admissions').insert({
        student_name: body.student_name || '',
        dob: body.dob || '',
        gender: body.gender || '',
        applying_class: body.applying_class || '',
        blood_group: body.blood_group || '',
        religion: body.religion || '',
        category: body.category || '',
        aadhaar: body.aadhaar || '',
        nationality: body.nationality || 'Indian',
        father_name: body.father_name || '',
        father_occupation: body.father_occupation || '',
        father_phone: body.father_phone || '',
        father_email: body.father_email || '',
        mother_name: body.mother_name || '',
        mother_occupation: body.mother_occupation || '',
        mother_phone: body.mother_phone || '',
        contact_phone: body.contact_phone || '',
        family_income: body.family_income || '',
        previous_school: body.previous_school || '',
        previous_class: body.previous_class || '',
        previous_percent: body.previous_percent || '',
        passing_year: body.passing_year || '',
        medium: body.medium || '',
        achievements: body.achievements || '',
        medical: body.medical || '',
        address: body.address || '',
        village: body.village || '',
        block: body.block || '',
        district: body.district || '',
        state: body.state || '',
        pincode: body.pincode || '',
        distance: body.distance || '',
        transport: body.transport || '',
        emergency_contact: body.emergency_contact || '',
        photo_url: photoUrl ? '[Photo Uploaded]' : '',
        doc_birth_cert: birthUrl ? '[Uploaded]' : '',
        doc_marksheet: markUrl ? '[Uploaded]' : '',
        doc_tc: tcUrl ? '[Uploaded]' : '',
        doc_aadhaar: aadUrl ? '[Uploaded]' : '',
        photo_file_url: photoUrl || '',
        birth_cert_url: birthUrl || '',
        marksheet_url: markUrl || '',
        tc_url: tcUrl || '',
        aadhaar_url: aadUrl || '',
        application_number: appNumber,
        academic_year: academicYear,
        status: 'Pending'
      }).select().single();
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data });
    }

    // ── ALL BELOW REQUIRE ADMIN TOKEN ──
    if (!isAdmin(event.headers)) {
      return cors({ success: false, error: 'Unauthorized' }, 401);
    }

    // Get enquiries
    if (action === 'get_enquiries' && method === 'GET') {
      const { data, error } = await db.from('ica_enquiries').select('*').order('created_at', { ascending: false });
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data: data || [] });
    }

    // Update enquiry
    if (action === 'update_enquiry' && method === 'POST') {
      const { id, ...updates } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_enquiries').update(updates).eq('id', id);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // Delete enquiry
    if (action === 'delete_enquiry' && method === 'POST') {
      const { id } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_enquiries').delete().eq('id', id);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // Get admissions
    if (action === 'get_admissions' && method === 'GET') {
      const { data, error } = await db.from('ica_admissions').select('*').order('created_at', { ascending: false });
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data: data || [] });
    }

    // Update admission
    if (action === 'update_admission' && method === 'POST') {
      const { id, ...updates } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_admissions').update(updates).eq('id', id);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // Delete admission
    if (action === 'delete_admission' && method === 'POST') {
      const { id } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_admissions').delete().eq('id', id);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // Add notice
    if (action === 'add_notice' && method === 'POST') {
      const { title, category, content } = body;
      if (!title) return cors({ success: false, error: 'Title required' }, 400);
      const { data, error } = await db.from('ica_notices').insert({ title, category: category || 'Announcement', content: content || '' }).select().single();
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data });
    }

    // Delete notice
    if (action === 'delete_notice' && method === 'POST') {
      const { id } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_notices').delete().eq('id', id);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // Get gallery
    if (action === 'get_gallery' && method === 'GET') {
      const { data, error } = await db.from('ica_gallery').select('*').order('created_at', { ascending: false });
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data: data || [] });
    }

    // Add gallery
    if (action === 'add_gallery' && method === 'POST') {
      const { caption, category, image_url } = body;
      if (!caption) return cors({ success: false, error: 'Caption required' }, 400);
      const { data, error } = await db.from('ica_gallery').insert({ caption, category: category || 'Events', image_url: image_url || '' }).select().single();
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data });
    }

    // Delete gallery
    if (action === 'delete_gallery' && method === 'POST') {
      const { id } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_gallery').delete().eq('id', id);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // Toggle admission
    if (action === 'toggle_admission' && method === 'POST') {
      const { open } = body;
      const { error } = await db.from('ica_settings').upsert({ key: 'admission_open', value: open ? 'true' : 'false' }, { onConflict: 'key' });
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, open });
    }

    // Update a setting (admission_year, theme_primary, theme_navy, etc.)
    if (action === 'update_setting' && method === 'POST') {
      const { key, value } = body;
      if (!key) return cors({ success: false, error: 'Missing key' }, 400);
      const { error } = await db.from('ica_settings').upsert({ key, value: String(value || '') }, { onConflict: 'key' });
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // ── FORM SCHEMA (Form Builder) ──

    // List all form schemas (admin)
    if (action === 'list_forms' && method === 'GET') {
      const { data, error } = await db.from('ica_form_schema').select('*').order('updated_at', { ascending: false });
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data: data || [] });
    }

    // Get one form schema by id (admin)
    if (action === 'get_form' && method === 'GET') {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { data, error } = await db.from('ica_form_schema').select('*').eq('id', id).maybeSingle();
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data });
    }

    // Create or update a form schema (upsert by id, or insert new)
    if (action === 'save_form' && method === 'POST') {
      const { id, form_key, title, schema_json, is_active } = body;
      if (!form_key || !title || !schema_json) return cors({ success: false, error: 'Missing form_key, title, or schema' }, 400);
      const row = { form_key, title, schema_json, is_active: !!is_active, updated_at: new Date().toISOString() };
      let result;
      if (id) {
        result = await db.from('ica_form_schema').update(row).eq('id', id).select().single();
      } else {
        result = await db.from('ica_form_schema').insert(row).select().single();
      }
      if (result.error) return cors({ success: false, error: result.error.message }, 400);
      return cors({ success: true, data: result.data });
    }

    // Toggle a form's active state (publish/unpublish on website)
    if (action === 'toggle_form' && method === 'POST') {
      const { id, is_active } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_form_schema').update({ is_active: !!is_active }).eq('id', id);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // Delete a form schema
    if (action === 'delete_form' && method === 'POST') {
      const { id } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_form_schema').delete().eq('id', id);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // Get submissions for a custom form
    if (action === 'get_form_submissions' && method === 'GET') {
      const formKey = event.queryStringParameters && event.queryStringParameters.form_key;
      let q = db.from('ica_form_submissions').select('*').order('created_at', { ascending: false });
      if (formKey) q = q.eq('form_key', formKey);
      const { data, error } = await q;
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true, data: data || [] });
    }

    // Update a generic form submission (status etc.)
    if (action === 'update_form_submission' && method === 'POST') {
      const { id, ...updates } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_form_submissions').update(updates).eq('id', id);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // Delete a generic form submission
    if (action === 'delete_form_submission' && method === 'POST') {
      const { id } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_form_submissions').delete().eq('id', id);
      if (error) return cors({ success: false, error: error.message }, 400);
      return cors({ success: true });
    }

    // Dashboard stats
    if (action === 'get_stats' && method === 'GET') {
      const today = new Date().toISOString().split('T')[0];
      const [enqR, admR, notR] = await Promise.all([
        db.from('ica_enquiries').select('id, status, created_at'),
        db.from('ica_admissions').select('id, status, created_at'),
        db.from('ica_notices').select('id')
      ]);
      const enqs = enqR.data || [];
      const adms = admR.data || [];
      return cors({
        success: true,
        data: {
          enq_total: enqs.length,
          enq_new: enqs.filter(e => e.status === 'New').length,
          adm_total: adms.length,
          adm_pending: adms.filter(a => a.status === 'Pending').length,
          adm_confirmed: adms.filter(a => a.status === 'Confirmed').length,
          adm_today: adms.filter(a => a.created_at && a.created_at.startsWith(today)).length,
          notices: (notR.data || []).length
        }
      });
    }

    return cors({ success: false, error: 'Unknown action' }, 404);

  } catch (err) {
    console.error('Function error:', err);
    return cors({ success: false, error: 'Server error: ' + err.message }, 500);
  }
};
