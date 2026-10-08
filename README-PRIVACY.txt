# Complaint Helper — Privacy Content Update

เวอร์ชันนี้ทำให้ส่วนความเป็นส่วนตัวสั้น อ่านง่าย และมีหน้า Privacy Policy แยกต่างหาก โดยไม่ต้องแก้ฟังก์ชัน Wizard / Smart Routing / Analytics

## อัปโหลดทับ GitHub

ไปที่ repository `Si-Suan-png/complaint-helper` → Add file → Upload files แล้วอัปโหลด 3 ไฟล์ต่อไปนี้:

- `index.html` (แทนของเดิม)
- `style.css` (แทนของเดิม)
- `privacy.html` (เพิ่มไฟล์ใหม่)

`script.js` และ `IMG_1011.jpeg` ใน ZIP เป็นสำเนาจากเวอร์ชันเดิม ไม่จำเป็นต้องอัปโหลดซ้ำ หากบน GitHub เป็น V19 ล่าสุดอยู่แล้ว

Commit โดยตรงไปยัง `main` แล้วลองเปิด:

- https://si-suan-png.github.io/complaint-helper/?privacy=20
- https://si-suan-png.github.io/complaint-helper/privacy.html

## หมายเหตุ

- เว็บไซต์ยังใช้ localStorage key เดิม `consumerComplaintProductionV16`; ไม่ล้างแบบร่างเดิมโดยการอัปโหลดไฟล์ชุดนี้
- Analytics ยังไม่ได้เปิดจนกว่าจะกำหนด Website ID ของ Umami
- หากเปิดใช้ Analytics หรือบริการเก็บข้อมูลเพิ่มเติมในอนาคต ต้องอัปเดตนโยบายให้ตรงกับการทำงานจริง
- ควรเพิ่มช่องทางติดต่อผู้ดูแลเว็บไซต์ในนโยบายก่อนเผยแพร่เป็นบริการสาธารณะเต็มรูปแบบ และตรวจสอบหน้าที่ตามกฎหมายข้อมูลส่วนบุคคลที่เกี่ยวข้อง
