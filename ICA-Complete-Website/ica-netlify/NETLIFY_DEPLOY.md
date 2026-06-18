# 🚀 ICA Website — Netlify Deploy Guide

## Step 1 — Supabase SQL (Tables Banao)
Supabase → SQL Editor → Run karo:

```sql
CREATE TABLE ica_enquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_name TEXT NOT NULL,
  child_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  class TEXT,
  area TEXT,
  enquiry_type TEXT DEFAULT 'New Admission',
  message TEXT,
  status TEXT DEFAULT 'New',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ica_notices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Announcement',
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ica_gallery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  caption TEXT NOT NULL,
  category TEXT DEFAULT 'Events',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ica_admissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_name TEXT NOT NULL,
  dob TEXT,
  gender TEXT,
  applying_class TEXT NOT NULL,
  previous_school TEXT,
  previous_class TEXT,
  previous_percent TEXT,
  religion TEXT,
  category TEXT,
  blood_group TEXT,
  aadhaar TEXT,
  father_name TEXT NOT NULL,
  father_occupation TEXT,
  father_phone TEXT,
  father_email TEXT,
  mother_name TEXT NOT NULL,
  mother_occupation TEXT,
  mother_phone TEXT,
  contact_phone TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT,
  pincode TEXT,
  photo_url TEXT,
  doc_birth_cert TEXT,
  doc_marksheet TEXT,
  doc_tc TEXT,
  doc_aadhaar TEXT,
  status TEXT DEFAULT 'Pending',
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ica_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO ica_settings (key, value) VALUES ('admission_open', 'false');

-- RLS Policies
ALTER TABLE ica_enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_enq" ON ica_enquiries FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE ica_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_notices" ON ica_notices FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE ica_gallery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_gallery" ON ica_gallery FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE ica_admissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_admissions" ON ica_admissions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE ica_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_settings" ON ica_settings FOR ALL USING (true) WITH CHECK (true);
```

## Step 2 — Netlify Deploy
1. netlify.com → Sign up free
2. "Add new site" → "Deploy manually" → ZIP upload karo
3. Ya GitHub se connect karo

## Step 3 — Environment Variables (MOST IMPORTANT)
Netlify → Site Settings → Environment Variables → Add:

| Key | Value |
|-----|-------|
| SUPABASE_URL | https://fbqluczueoqsuqylpdqp.supabase.co |
| SUPABASE_SERVICE_KEY | (service_role key from Supabase → Settings → API → Legacy → service_role) |
| ADMIN_TOKEN | (koi bhi strong random string — e.g. ICA@2025#SecureToken$789) |

## Step 4 — Admin Login
- Admin ID: ICA24391174
- Password: admin@ICA2025
- Turant change karo!

## Security
- Supabase keys browser mein KABHI nahi dikhte
- Sab API calls server-side Netlify Function se hoti hain
- F12 → Network tab mein sirf ADMIN_TOKEN dikhega, Supabase keys nahi
