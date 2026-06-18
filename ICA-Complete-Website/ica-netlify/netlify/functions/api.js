// netlify/functions/api.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN  = 'ICA@Secret';

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase env vars missing: SUPABASE_URL or SUPABASE_SERVICE_KEY not set in Netlify');
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

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
  const token = headers['x-admin-token'] || headers['X-Admin-Token'];
  return token === ADMIN_TOKEN;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({});

  const path   = event.queryStringParameters?.action || '';
  const method = event.httpMethod;
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  try {
    const sb = getSupabase();

    // ════════════════════════════════
    // PUBLIC ROUTES — No auth needed
    // ════════════════════════════════

    // GET notices
    if (path === 'get_notices' && method === 'GET') {
      const { data, error } = await sb
        .from('ica_notices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw new Error('get_notices: ' + error.message);
      return cors({ success: true, data: data || [] });
    }

    // POST enquiry (contact form — public)
    if (path === 'submit_enquiry' && method === 'POST') {
      const { parent_name, child_name, phone, class: cls, area, enquiry_type, message } = body;
      if (!parent_name || !child_name || !phone || !cls) {
        return cors({ success: false, error: 'Required fields missing' }, 400);
      }
      if (!/^\d{10}$/.test(phone)) {
        return cors({ success: false, error: 'Invalid phone number — must be 10 digits' }, 400);
      }
      // Rate limit — same phone se 24h mein max 3
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing, error: rErr } = await sb
        .from('ica_enquiries')
        .select('id')
        .eq('phone', phone)
        .gte('created_at', since);
      if (rErr) throw new Error('rate_check: ' + rErr.message);
      if (existing && existing.length >= 3) {
        return cors({ success: false, error: 'Too many submissions from this number. Please try after 24 hours.' }, 429);
      }
      const { data, error } = await sb
        .from('ica_enquiries')
        .insert({
          parent_name, child_name, phone,
          class: cls, area: area || null,
          enquiry_type: enquiry_type || 'New Admission',
          message: message || null,
          status: 'New'
        })
        .select()
        .single();
      if (error) throw new Error('insert_enquiry: ' + error.message);
      return cors({ success: true, data });
    }

    // ════════════════════════════════
    // ADMIN ROUTES — Token required
    // ════════════════════════════════
    if (!isAdmin(event.headers)) {
      return cors({ success: false, error: 'Unauthorized' }, 401);
    }

    // GET all enquiries
    if (path === 'get_enquiries' && method === 'GET') {
      const { data, error } = await sb
        .from('ica_enquiries')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error('get_enquiries: ' + error.message);
      return cors({ success: true, data: data || [] });
    }

    // UPDATE enquiry
    if (path === 'update_enquiry' && method === 'POST') {
      const { id, status } = body;
      if (!id || !status) return cors({ success: false, error: 'Missing id or status' }, 400);
      const { error } = await sb.from('ica_enquiries').update({ status }).eq('id', id);
      if (error) throw new Error('update_enquiry: ' + error.message);
      return cors({ success: true });
    }

    // DELETE enquiry
    if (path === 'delete_enquiry' && method === 'POST') {
      const { id } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await sb.from('ica_enquiries').delete().eq('id', id);
      if (error) throw new Error('delete_enquiry: ' + error.message);
      return cors({ success: true });
    }

    // ADD notice
    if (path === 'add_notice' && method === 'POST') {
      const { title, category, content } = body;
      if (!title) return cors({ success: false, error: 'Title required' }, 400);
      const { data, error } = await sb
        .from('ica_notices')
        .insert({ title, category: category || 'Announcement', content: content || null })
        .select()
        .single();
      if (error) throw new Error('add_notice: ' + error.message);
      return cors({ success: true, data });
    }

    // DELETE notice
    if (path === 'delete_notice' && method === 'POST') {
      const { id } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await sb.from('ica_notices').delete().eq('id', id);
      if (error) throw new Error('delete_notice: ' + error.message);
      return cors({ success: true });
    }

    // GET gallery
    if (path === 'get_gallery' && method === 'GET') {
      const { data, error } = await sb
        .from('ica_gallery')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error('get_gallery: ' + error.message);
      return cors({ success: true, data: data || [] });
    }

    // ADD gallery
    if (path === 'add_gallery' && method === 'POST') {
      const { caption, category, image_url } = body;
      if (!caption) return cors({ success: false, error: 'Caption required' }, 400);
      const { data, error } = await sb
        .from('ica_gallery')
        .insert({ caption, category: category || 'Events', image_url: image_url || null })
        .select()
        .single();
      if (error) throw new Error('add_gallery: ' + error.message);
      return cors({ success: true, data });
    }

    // DELETE gallery
    if (path === 'delete_gallery' && method === 'POST') {
      const { id } = body;
      if (!id) return cors({ success: false, error: 'Missing id' }, 400);
      const { error } = await sb.from('ica_gallery').delete().eq('id', id);
      if (error) throw new Error('delete_gallery: ' + error.message);
      return cors({ success: true });
    }

    // Dashboard stats
    if (path === 'get_stats' && method === 'GET') {
      const [enqRes, notRes] = await Promise.all([
        sb.from('ica_enquiries').select('id, status, created_at'),
        sb.from('ica_notices').select('id'),
      ]);
      if (enqRes.error) throw new Error('get_stats enq: ' + enqRes.error.message);
      const enqs  = enqRes.data || [];
      const today = new Date().toLocaleDateString('en-IN');
      return cors({
        success: true,
        data: {
          total:     enqs.length,
          contacted: enqs.filter(e => e.status === 'Contacted').length,
          pending:   enqs.filter(e => e.status === 'Pending' || e.status === 'New').length,
          notices:   (notRes.data || []).length,
          today:     enqs.filter(e => new Date(e.created_at).toLocaleDateString('en-IN') === today).length,
        }
      });
    }

    return cors({ success: false, error: 'Invalid action: ' + path }, 404);

  } catch (err) {
    console.error('API Error [' + (event.queryStringParameters?.action || '?') + ']:', err.message);
    // Error message frontend ko bhi dikhao — debug ke liye helpful
    return cors({ success: false, error: err.message || 'Server error' }, 500);
  }
};
