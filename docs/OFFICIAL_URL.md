# ทำให้ URL ของระบบ CLC เป็นทางการ

ตอนนี้ระบบเปิดที่ `https://nattapongfc11-max.github.io/CLC-WH-Loading-Calculator/` ซึ่งเป็นชื่อบัญชี GitHub ส่วนตัว
ต้องการชื่อแบบ `https://clc.<โดเมนของบริษัท>` ต้องมี **โดเมนที่บริษัทเป็นเจ้าของ** ก่อน — ตั้งชื่อจากฝั่งโค้ดอย่างเดียวไม่ได้
(ไฟล์ `CNAME` ที่ไม่มีโดเมนจริงรองรับจะทำให้เว็บล่ม จึงยังไม่ได้ใส่ไว้ใน repo)

## สิ่งที่ทำในโค้ดแล้ว (v3.1)
- ชื่อหน้า / คำอธิบาย / ไอคอนแท็บ / สีธีม ของบราวเซอร์ (ไม่มีคำว่า "v2" แล้ว)
- `noindex` — Google ไม่เอาหน้า Login ของระบบภายในไปแสดงในผลค้นหา (ลบ meta `robots` ใน `index.html` ได้ถ้าต้องการให้ค้นเจอ)

## ตัวเลือก (เรียงจากง่ายไปยาก)
| # | วิธี | ได้ URL แบบ | ต้องมี |
|---|------|-------------|--------|
| A | โดเมนบริษัท + GitHub Pages | `https://clc.pioneer-xxx.com` | IT เพิ่ม DNS `CNAME` |
| B | ย้าย repo ไปอยู่ใน GitHub Organization ของบริษัท | `https://<org>.github.io/CLC-WH-Loading-Calculator/` | สร้าง Org + Transfer repo |
| C | Cloudflare Pages / Workers (มีบัญชี Cloudflare อยู่แล้วสำหรับ R2) | `https://clc.pioneer-xxx.com` | โดเมนอยู่ใน Cloudflare DNS |

### วิธี A (แนะนำ)
1. ขอ IT เพิ่ม DNS record: ชนิด `CNAME` · ชื่อ `clc` · ค่า `nattapongfc11-max.github.io` (ถ้า repo ย้ายไป Organization ให้ใช้ `<org>.github.io`)
2. GitHub → repo → **Settings → Pages → Custom domain** ใส่ `clc.pioneer-xxx.com` → Save → รอ DNS check เป็นสีเขียว → ติ๊ก **Enforce HTTPS**
   (GitHub จะสร้างไฟล์ `CNAME` ใน repo ให้เอง)
3. ทำตาม "ต้องแก้หลังเปลี่ยน URL" ด้านล่างให้ครบ — **ถ้าข้ามข้อ 3 Login ยืนยันอีเมลและรูปถ่ายตู้จะใช้ไม่ได้**

## ต้องแก้หลังเปลี่ยน URL (origin ใหม่)
| ที่ไหน | ต้องทำ |
|--------|--------|
| Supabase → Authentication → URL Configuration | **Site URL** = URL ใหม่ · เพิ่มใน **Redirect URLs** (ลิงก์ยืนยันอีเมล / รีเซ็ตรหัสผ่านจะกลับมาที่ URL นี้) |
| Cloudflare R2 bucket → Settings → CORS policy | `AllowedOrigins` ใส่ `https://clc.pioneer-xxx.com` (เฉพาะ origin ไม่มี `/` ท้ายและไม่มี path) — ช่วงเปลี่ยนให้ใส่ทั้งของเก่าและของใหม่ |
| Supabase Edge Function `photos` | ถ้าตั้ง secret `ALLOWED_ORIGINS` ไว้ ให้เพิ่ม origin ใหม่ (คั่นด้วย `,`) |
| บุ๊กมาร์ก / README / ลิงก์ที่แจก | อัปเดตเป็น URL ใหม่ (URL เก่ายังเปิดได้จนกว่าจะปิด Pages) |

ข้อมูลของผู้ใช้ (แผน, สิทธิ์) อยู่ใน Supabase จึงไม่หายเมื่อเปลี่ยน URL แต่ **โลโก้ที่อัปโหลดและภาษาที่เลือกไว้ใน browser เดิม** เก็บแบบแยกตาม URL — ต้องตั้งใหม่ครั้งเดียวบน URL ใหม่
