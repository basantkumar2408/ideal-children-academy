// netlify/functions/admission.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN     = 'ICA@Secret';

function sb() { return createClient(SUPABASE_URL, SUPABASE_KEY); }

function cors(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function isAdmin(headers) {
  const t = headers['x-admin-token'] || headers['X-Admin-Token'];
  return t === ADMIN_TOKEN;
}
console.log('ADMISSION FUNCTION VERSION 2026-06-18');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});
  const action = event.queryStringParameters?.action || '';
  const method = event.httpMethod;
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}
  const db = sb();

  try {

    // ── PUBLIC: Check if admissions are open ──
    if (action === 'admission_status' && method === 'GET') {
      const { data } = await db.from('ica_settings').select('value').eq('key', 'admission_open').single();
      return cors({ success: true, open: data?.value === 'true' });
    }

    // ── PUBLIC: Submit admission form ──
    if (action === 'submit_admission' && method === 'POST') {
      // Check if admissions are open
      const { data: setting } = await db.from('ica_settings').select('value').eq('key', 'admission_open').single();
      if (!setting || setting.value !== 'true') {
        return cors({ success: false, error: 'Admissions are currently closed.' }, 403);
      }
      const required = ['student_name','dob','gender','applying_class','father_name','mother_name','contact_phone','address'];
      for (const f of required) {
        if (!body[f]) return cors({ success: false, error: `Required field missing: ${f}` }, 400);
      }
      if (!/^\d{10}$/.test(body.contact_phone)) {
        return cors({ success: false, error: 'Invalid phone number' }, 400);
      }
      const { data, error } = await db.from('ica_admissions').insert({
        ...body,
        status: 'Pending',
        created_at: new Date().toISOString()
      }).select().single();
      if (error) throw error;
      return cors({ success: true, data });
    }

    // ── ADMIN ONLY below ──
    if (!isAdmin(event.headers)) return cors({ success: false, error: 'Unauthorized' }, 401);

    // Toggle admission open/close
    if (action === 'toggle_admission' && method === 'POST') {
      const { open } = body;
      const { error } = await db.from('ica_settings').upsert({ key: 'admission_open', value: open ? 'true' : 'false' }, { onConflict: 'key' });
      if (error) throw error;
      return cors({ success: true, open });
    }

    // Get all admissions
    if (action === 'get_admissions' && method === 'GET') {
      const { data, error } = await db.from('ica_admissions').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return cors({ success: true, data });
    }

    // Update admission status / fields
    if (action === 'update_admission' && method === 'POST') {
      const { id, ...updates } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_admissions').update(updates).eq('id', id);
      if (error) throw error;
      return cors({ success: true });
    }

    // Delete admission
    if (action === 'delete_admission' && method === 'POST') {
      const { id } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await db.from('ica_admissions').delete().eq('id', id);
      if (error) throw error;
      return cors({ success: true });
    }

    return cors({ success: false, error: 'Invalid action' }, 404);
  } catch (err) {
    console.error(err);
    return cors({ success: false, error: 'Server error: ' + err.message }, 500);
  }
};
