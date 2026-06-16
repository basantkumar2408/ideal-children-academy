# 🚀 Supabase Setup Guide — ICA Website

## Step 1 — Supabase Account Banao (FREE)
1. jaao: https://supabase.com
2. "Start your project" → Sign up with GitHub ya Email
3. "New Project" banao → naam: `ica-school`
4. Password set karo (yaad rakho) → Region: South Asia (Singapore) → Create

## Step 2 — Database Tables Banao
Project open karo → Left sidebar → **SQL Editor** → **New Query**

Yeh SQL paste karo aur RUN karo:

```sql
-- Enquiries Table
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

-- Notices Table
CREATE TABLE ica_notices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Announcement',
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gallery Table
CREATE TABLE ica_gallery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  caption TEXT NOT NULL,
  category TEXT DEFAULT 'Events',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow public read for notices (website par dikhega)
ALTER TABLE ica_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read notices" ON ica_notices FOR SELECT USING (true);
CREATE POLICY "Anyone can insert notices" ON ica_notices FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete notices" ON ica_notices FOR DELETE USING (true);

-- Allow public insert for enquiries (contact form)
ALTER TABLE ica_enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit enquiry" ON ica_enquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read enquiries" ON ica_enquiries FOR SELECT USING (true);
CREATE POLICY "Anyone can update enquiry" ON ica_enquiries FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete enquiry" ON ica_enquiries FOR DELETE USING (true);

-- Gallery policies
ALTER TABLE ica_gallery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read gallery" ON ica_gallery FOR SELECT USING (true);
CREATE POLICY "Anyone insert gallery" ON ica_gallery FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone delete gallery" ON ica_gallery FOR DELETE USING (true);
```

## Step 3 — API Keys Lo
Left sidebar → **Project Settings** → **API**
- **Project URL** copy karo (e.g. `https://abcxyz.supabase.co`)
- **anon public** key copy karo

## Step 4 — Website Mein Enter Karo
Website kholo → Ek baar setup screen aayega → URL aur Key paste karo → Save

## ✅ Done! Ab:
- Har device se admin login ho sakta hai
- Parent form data real database mein jayega
- Notices turant website par dikhenge
- Data kabhi delete nahi hoga (jab tak tum delete na karo)

---

## 🔐 Admin Login Details
- **Admin ID:** ICA24391174
- **Default Password:** admin@ICA2025
- **Pehla kaam:** Login karo → Change Password se naya password set karo!

---

## FREE Limits (Supabase Free Tier)
- 500 MB Database storage
- 50,000 monthly active users
- Unlimited API requests
- **Credit card nahi chahiye!**
