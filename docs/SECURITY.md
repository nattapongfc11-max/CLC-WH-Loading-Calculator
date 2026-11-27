# ความปลอดภัยของระบบ CLC (สรุปสถานะ + สิ่งที่ต้องทำนอกโค้ด)

ตรวจล่าสุด: 27/11/2026 (อ่านสถานะจริงจาก Supabase / Cloudflare ไม่ได้เดาจากโค้ด)

## 1) ระบบนี้เก็บข้อมูลที่ไหน
| ส่วน | อยู่ที่ | ข้อมูล |
|------|--------|--------|
| หน้าเว็บ (ไฟล์ static) | GitHub Pages | โค้ดอย่างเดียว ไม่มีข้อมูลลูกค้า |
| ฐานข้อมูล + Login | Supabase (`takwoycaniiaesepbmss`) | Part master, แผนโหลดตู้, Booking, ผู้ใช้/สิทธิ์ |
| รูปถ่ายตู้ | Cloudflare R2 bucket `clc-photos-apac` (private) | ไฟล์ JPEG ≤ 3 MB, เข้าถึงผ่านลิงก์ชั่วคราว 10–15 นาที |
| ตัวกลางจัดการรูป | Supabase Edge Function `photos` | ถือ R2 key เป็น secret ฝั่งเซิร์ฟเวอร์ ไม่เคยส่งให้เบราว์เซอร์ |

## 2) ชั้นป้องกันที่มีอยู่แล้ว
- **RLS เปิดครบทุกตาราง** และ role `anon` (ใครก็ได้ที่เปิดเว็บ) ไม่มีสิทธิ์ select/insert เลย — key ที่เห็นในโค้ด (`sb_publishable_…`) ออกแบบมาให้เปิดเผยได้ ใช้อ่านข้อมูลเองไม่ได้
- **สิทธิ์รายคน** (`user_roles.perms` + ฟังก์ชัน `clc_can`) ถูกบังคับที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่มในหน้าเว็บ; trigger กัน admin คนสุดท้ายถูกลบ/ลดสิทธิ์
- **Logistics แก้แผนไม่ได้** (v3.2 migration `20261127`): Slide/Cancel ผ่านฟังก์ชัน `plan_delivery_update` ที่แตะได้แค่ 5 ช่อง
- **รูปถ่าย**: bucket private, อัปโหลด/ดูผ่าน presigned URL อายุสั้น, ตรวจชนิด/ขนาดไฟล์ก่อนบันทึก, Edge Function เรียก DB ด้วยสิทธิ์ของผู้เรียก (RLS ยังบังคับ)
- **v3.3**: ไม่โหลดอะไรจากภายนอก (supabase-js + ฟอนต์อยู่ใน `vendor/` พร้อม SRI), CSP จำกัดปลายทางที่เชื่อมต่อได้, แก้ช่องแทรกโค้ดใน `onclick`, 2FA (TOTP) + migration บังคับฝั่งเซิร์ฟเวอร์

## 3) สิ่งที่ต้องตั้งค่าเองใน dashboard (โค้ดทำแทนไม่ได้)
| ที่ไหน | ทำอะไร | ทำไม |
|--------|--------|------|
| GitHub (บัญชีเจ้าของ repo) | เปิด 2FA + Settings → Branches → protect `main` (ต้องผ่าน PR) | ใครแก้โค้ดได้ = ใส่สคริปต์ขโมย session ของผู้ใช้ทุกคนได้ — จุดเสี่ยงสูงสุด |
| Supabase / Cloudflare (บัญชีเจ้าของ) | เปิด 2FA | ผู้ถือบัญชีเข้าถึงข้อมูลทั้งหมดได้ข้าม RLS |
| Supabase → Authentication → Providers → Email | ปิด **Allow new users to sign up** เมื่อสร้างผู้ใช้ครบ (ผู้ดูแลเชิญเอง) และตั้ง `window.CLC_SIGNUP_ENABLED=false` | กันคนนอกสร้างบัญชี (บัญชีใหม่ไม่เห็นข้อมูลอยู่แล้ว แต่ลดพื้นที่โจมตี) |
| Supabase → Authentication → Passwords | เปิด **Leaked password protection** (ถ้าแผนรองรับ) และตั้งความยาวขั้นต่ำ ≥ 10 | กันรหัสที่เคยรั่ว |
| Supabase → Authentication → URL Configuration | Site URL / Redirect URLs ให้มีเฉพาะ URL จริงของระบบ | กันลิงก์ยืนยันอีเมล/รีเซ็ตรหัสไปเว็บอื่น |
| Cloudflare R2 → `clc-photos-apac` → Settings | **Public access = Disabled** (ปิด r2.dev และไม่ผูก custom domain) และ CORS เฉพาะ origin ของเว็บ | รูปต้องเข้าถึงได้ผ่านลิงก์ชั่วคราวเท่านั้น |
| Cloudflare → API Tokens | token ทุกตัวต้อง **จำกัด bucket + มีวันหมดอายุ**; ลบตัวที่ไม่ใช้ | ดูหัวข้อ 4 |
| Supabase → Database → Backups | ตรวจว่ามี daily backup (ถ้าแผนรองรับให้เปิด PITR) และลอง restore ไปโปรเจกต์ทดสอบปีละครั้ง | ป้องกันข้อมูลถูกลบ/เสียหาย (รวมกรณี ransomware ฝั่งบัญชี) |

## 4) ถ้า token / รหัสหลุด (เช่น `cfat_…` ที่เคยวางในแชท)
1. **เพิกถอนทันที**: Cloudflare Dashboard → Manage Account → **Account API Tokens** (token แบบ user: My Profile → API Tokens) → ⋯ → **Delete** (หรือ Roll เพื่อออกค่าใหม่)
2. **ตรวจย้อนหลัง**: Cloudflare → **Audit Logs** ช่วงที่ token ยังใช้ได้ — มีการสร้าง/ลบ bucket, token, DNS หรือเปลี่ยนสิทธิ์ที่ไม่ใช่ของเราไหม (ปัจจุบันมี bucket เดียว `clc-photos-apac`)
3. **R2 Access Key (คนละชุดกับ API token)**: ถ้าเคยหลุดด้วย → R2 → Manage API tokens → Roll แล้วอัปเดต Supabase → Edge Functions → Secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) จากนั้นกด "ตรวจ" ในหน้า Booking
4. **Supabase key**: ถ้า `service_role` หรือรหัสผ่าน DB หลุด → Settings → API / Database → reset ทันที (publishable key ไม่ถือเป็นความลับ)
5. บันทึกเหตุการณ์ (เวลา, อะไรหลุด, ทำอะไรไปแล้ว) และบอกผู้เกี่ยวข้อง

**หลักปฏิบัติ**: อย่าวาง token/รหัสในแชท อีเมล หรือ commit เข้า repo — ให้ผู้ช่วย/เพื่อนร่วมงานใช้ token แบบ least-privilege ที่มีวันหมดอายุ และลบทิ้งเมื่อจบงาน

## 5) ตรวจเป็นประจำ (เดือนละครั้ง หรือก่อน deploy)
- Supabase → Advisors → **Security** (ปัจจุบันคำเตือน "SECURITY DEFINER executable" 4 ข้อเป็นของตั้งใจ: `admin_list_users`, `clc_can`, `clc_role`, `plan_delivery_update` — ทุกตัวตรวจสิทธิ์ภายในและ `anon` เรียกไม่ได้)
- Supabase → Authentication → Users: บัญชีที่ไม่รู้จัก / ยังไม่มี role
- Cloudflare → Audit Logs และรายการ API Tokens
- GitHub → Settings → Security log / รายการ collaborators
- รัน `npm test` (มี `tests/security.test.js`) ก่อน merge ทุกครั้ง

## 6) ยังไม่ได้ทำ / ข้อจำกัดที่ควรรู้
- `script-src` ยังต้องมี `'unsafe-inline'` เพราะหน้าเว็บเป็นไฟล์เดียวที่ใช้ `onclick="…"` — ขั้นถัดไปคือย้ายเป็น `addEventListener` แล้วตัด `'unsafe-inline'` ออก
- GitHub Pages ตั้ง HTTP header เองไม่ได้ (HSTS, X-Frame-Options, `frame-ancestors` ใช้ผ่าน meta ไม่ได้) → ย้ายไป Cloudflare Pages + โดเมนบริษัท (ตัวเลือก C ใน `docs/OFFICIAL_URL.md`) จะได้ header ครบ + WAF/rate limit
- Edge Function `photos` ยังไม่มี rate limit (ผู้ไม่ล็อกอินยิงได้แต่ได้ 401); ไฟล์ที่ขอ URL อัปโหลดแล้วไม่ commit จะค้างใน R2 (ตั้ง Lifecycle rule ลบ object ที่ไม่อยู่ใน `delivery_photos` เป็นระยะ)
- ยังไม่มี audit log ว่าใครแก้/ลบแผน (มีแค่ `updated_by` ล่าสุด)
