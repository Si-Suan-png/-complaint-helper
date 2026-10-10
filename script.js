let currentStep=1;
let currentWizardQuestion=1;
let currentComplaintTone="official";
let pendingAddressRestore=null;
let autoSaveTimer=null,saveStatusTimer=null,toastTimer=null;
const AUTO_SAVE_DELAY=1500;
const STORAGE_KEY="consumerComplaintProductionV16";

/*
  VERSION 24.1 + UMAMI — clarified follow-up; V23 complaint flow retained
  ------------------------------------
  ระบบนี้ "ไม่ส่งค่าจากฟอร์ม" ไปยัง Analytics
  ส่งได้เฉพาะชื่อ Event ที่อยู่ใน ANALYTICS_EVENTS เท่านั้น

  เชื่อมต่อ Website ID ของ Complaint Helper แล้ว
  ส่งเฉพาะชื่อ Event ที่อนุญาตไว้ โดยไม่แนบค่าจากฟอร์ม
*/
const ANALYTICS_CONFIG={
  enabled:true,
  websiteId:"87fc92a7-eb9e-49a6-ae95-3e82f8559bbc",
  scriptUrl:"https://cloud.umami.is/script.js",
  allowedDomain:"si-suan-png.github.io"
};

const ANALYTICS_EVENTS=new Set([
  "start_complaint",
  "continue_draft",
  "quick_start_parcel",
  "quick_start_refund",
  "quick_start_mismatch",
  "quick_start_service",
  "improve_text",
  "step_1_complete",
  "step_2_complete",
  "step_3_complete",
  "result_view",
  "copy_complaint",
  "copy_all",
  "open_ocpb",
  "wizard_q1_complete",
  "wizard_q2_complete",
  "wizard_q3_complete",
  "wizard_q4_complete",
  "wizard_q5_complete",
  "wizard_q6_complete",
  "wizard_q7_complete",
  "route_open_ocpb",
  "route_open_etda",
  "route_open_nbtc",
  "route_open_oic",
  "route_open_bot",
  "route_open_thpost",
  "share_line",
  "share_facebook",
  "share_copy_link",
  "go_fill_missing",
  "open_agency_finder",
  "agency_result_view",
  "open_followup_tool",
  "followup_generate",
  "followup_copy",
  "followup_official_link_open",
  "followup_parcel_tracking_open",
  "route_open_1111",
  "route_open_police"
]);

let analyticsQueue=[];
let analyticsReady=false;

function analyticsConfigured(){
  const id=String(ANALYTICS_CONFIG.websiteId||"").trim();
  return Boolean(
    ANALYTICS_CONFIG.enabled &&
    id &&
    !id.includes("PASTE_") &&
    /^[0-9a-fA-F-]{20,}$/.test(id)
  );
}

function flushAnalyticsQueue(){
  if(!analyticsReady||!window.umami||typeof window.umami.track!=="function")return;
  const pending=[...analyticsQueue];
  analyticsQueue=[];
  pending.forEach(eventName=>{
    if(ANALYTICS_EVENTS.has(eventName))window.umami.track(eventName);
  });
}

function trackEvent(eventName){
  if(!ANALYTICS_EVENTS.has(eventName))return;
  if(!analyticsConfigured())return;

  if(analyticsReady&&window.umami&&typeof window.umami.track==="function"){
    window.umami.track(eventName);
    return;
  }

  if(analyticsQueue.length<30)analyticsQueue.push(eventName);
}

function initializeAnalytics(){
  if(!analyticsConfigured())return;

  const tracker=document.createElement("script");
  tracker.defer=true;
  tracker.src=ANALYTICS_CONFIG.scriptUrl;
  tracker.setAttribute("data-website-id",ANALYTICS_CONFIG.websiteId);
  tracker.setAttribute("data-domains",ANALYTICS_CONFIG.allowedDomain);
  tracker.setAttribute("data-do-not-track","true");
  tracker.setAttribute("data-exclude-search","true");
  tracker.setAttribute("data-exclude-hash","true");

  tracker.addEventListener("load",()=>{
    analyticsReady=true;
    flushAnalyticsQueue();
  });

  tracker.addEventListener("error",()=>{
    analyticsReady=false;
    analyticsQueue=[];
  });

  document.head.appendChild(tracker);
}


let provinces=[],districts=[],subDistricts=[];
const PROVINCE_URL="https://raw.githubusercontent.com/kongvut/thai-province-data/refs/heads/master/api/latest/province.json";
const DISTRICT_URL="https://raw.githubusercontent.com/kongvut/thai-province-data/refs/heads/master/api/latest/district.json";
const SUB_DISTRICT_URL="https://raw.githubusercontent.com/kongvut/thai-province-data/refs/heads/master/api/latest/sub_district.json";

const evidenceTypes=[
"สำเนาบัตรประชาชน / บัตรข้าราชการ","สำเนาใบเสร็จรับเงิน","หลักฐานการชำระเงิน / การโอนเงิน","หลักฐานแจ้งความประจำวัน","เอกสารโฆษณา","ฉลากสินค้า","ภาพถ่ายสินค้า / ความเสียหาย","สำเนาสัญญา","หนังสือมอบอำนาจ","สำเนากรมธรรม์","สำเนาหนังสือเดินทาง","สำเนาบัญชีธนาคาร / Statement","สำเนาใบแจ้งหนี้","ใบรับซ่อม","หลักฐานการสนทนา","เลขที่คำสั่งซื้อ","เอกสารประกอบการร้องเรียนทั้งหมด","อื่น ๆ"];
const allowedExtensions=["pdf","jpg","jpeg","png","doc","docx"];
const maxFileSize=5*1024*1024;

function showToast(message){const t=document.getElementById("toast");t.textContent=message;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2200)}
function startComplaint(){
  trackEvent("start_complaint");
  showForm();
  showStep(1);
  setWizardQuestion(1);
}
function startFromProblem(type){
  const quickEvent={
    parcel:"quick_start_parcel",
    refund:"quick_start_refund",
    mismatch:"quick_start_mismatch",
    service:"quick_start_service"
  };
  if(quickEvent[type])trackEvent(quickEvent[type]);

  const map={
    parcel:{label:"พัสดุเสียหาย",category:"ปัญหาการขนส่ง"},
    refund:{label:"ร้านไม่คืนเงิน",category:"ร้านค้าออนไลน์"},
    mismatch:{label:"ของไม่ตรงปก",category:"โฆษณาไม่ตรงความจริง"},
    service:{label:"บริการมีปัญหา",category:"บริการไม่เป็นธรรม"}
  };
  const selected=map[type];
  if(!selected){startComplaint();return}

  showForm();
  showStep(1);
  document.getElementById("category").value=selected.category;
  syncCategoryButtons();

  const badge=document.getElementById("quickStartBadge");
  badge.textContent=`เริ่มจากปัญหา: ${selected.label}`;
  badge.classList.remove("hidden");

  updateParcelFields();
  setWizardQuestion(2);
  saveDraft();
  showToast(`เลือก "${selected.label}" ให้แล้ว`);
}
function chooseCategory(value,button){
  document.getElementById("category").value=value;
  document.querySelectorAll(".wizard-choice").forEach(item=>item.classList.remove("selected"));
  if(button)button.classList.add("selected");
  updateParcelFields();
  saveDraft();
}
function syncCategoryButtons(){
  const selected=valueOf("category");
  document.querySelectorAll(".wizard-choice").forEach(button=>{
    button.classList.toggle("selected",button.dataset.category===selected);
  });
}
function radioValue(name){
  const selected=document.querySelector(`input[name="${name}"]:checked`);
  return selected?selected.value:"";
}
function setWizardQuestion(question,scroll=true,shouldSave=true){
  const q=Math.max(1,Math.min(7,Number(question)||1));
  currentWizardQuestion=q;
  document.querySelectorAll(".wizard-question").forEach(card=>{
    card.classList.toggle("active",Number(card.dataset.wizard)===q);
  });
  const percent=Math.round((q/7)*100);
  const counter=document.getElementById("wizardCounter");
  const percentLabel=document.getElementById("wizardPercent");
  const bar=document.getElementById("wizardBar");
  if(counter)counter.textContent=`คำถาม ${q} จาก 7`;
  if(percentLabel)percentLabel.textContent=`${percent}%`;
  if(bar)bar.style.width=`${percent}%`;
  if(q===7)updateWizardReview();
  if(q===5)updateParcelFields();
  if(scroll)window.scrollTo({top:0,behavior:"smooth"});
  if(shouldSave)saveDraft();
}
function validateWizardQuestion(question){
  if(question===1&&!valueOf("category")){
    showToast("กรุณาเลือกประเภทปัญหาก่อน");
    return false;
  }
  if(question===2&&!valueOf("subject")){
    showToast("กรุณาระบุสินค้า หรือบริการ");
    return false;
  }
  if(question===4&&valueOf("problem").length<10){
    showToast("กรุณาเล่าเหตุการณ์ให้ละเอียดขึ้นอีกเล็กน้อย");
    return false;
  }
  if(question===5&&!radioValue("contactedBusiness")){
    showToast("กรุณาเลือกว่าติดต่อร้านหรือบริษัทรึยัง");
    return false;
  }
  if(question===6&&checkedValues("request").length===0){
    showToast("กรุณาเลือกสิ่งที่ต้องการให้แก้ไขอย่างน้อย 1 ข้อ");
    return false;
  }
  if(question===7&&!valueOf("name")){
    showToast("กรุณากรอกชื่อผู้ร้องเรียน");
    return false;
  }
  return true;
}
function wizardNext(question){
  if(!validateWizardQuestion(question))return;
  trackEvent(`wizard_q${question}_complete`);
  setWizardQuestion(question+1);
}
function wizardBack(question){
  setWizardQuestion(question-1);
}

const PARCEL_CATEGORY="ปัญหาการขนส่ง";
function isParcelCase(){return valueOf("category")===PARCEL_CATEGORY}
function shippingCarrierName(){
  if(!isParcelCase())return "";
  const chosen=valueOf("shippingCarrier");
  return chosen==="อื่น ๆ"?valueOf("shippingCarrierOther"):chosen;
}
function updateParcelFields(){
  const parcel=isParcelCase();
  const details=document.getElementById("parcelDetails");
  if(details)details.classList.toggle("hidden",!parcel);
  const other=document.getElementById("shippingCarrierOtherWrap");
  if(other)other.classList.toggle("hidden",!parcel||valueOf("shippingCarrier")!=="อื่น ๆ");
  const claim=document.getElementById("parcelClaimWrap");
  if(claim)claim.classList.toggle("hidden",!parcel||radioValue("contactedBusiness")!=="ติดต่อแล้ว");
  const title=document.getElementById("contactQuestionTitle");
  if(title)title.textContent=parcel?"ข้อมูลพัสดุและการติดต่อบริษัทขนส่ง":"การติดต่อร้านค้าหรือบริษัท";
  const help=document.getElementById("contactQuestionHelp");
  if(help)help.textContent=parcel?"ระบุข้อมูลพัสดุที่ทราบ จากนั้นตอบเรื่องการติดต่อบริษัทด้านล่าง":"บอกว่าคุณเคยแจ้งปัญหากับผู้ประกอบการแล้วหรือยัง เพื่อให้ข้อความร้องเรียนตรงกับข้อเท็จจริง";
  const decisionTitle=document.getElementById("contactDecisionTitle");
  if(decisionTitle)decisionTitle.textContent=parcel?"คุณได้แจ้งปัญหากับบริษัทขนส่งแล้วหรือยัง?":"คุณเคยติดต่อร้านหรือบริษัทเรื่องนี้แล้วหรือยัง?";
  const outcome=document.getElementById("contactOutcomeLabel");
  if(outcome)outcome.textContent=parcel?"บริษัทขนส่งตอบว่าอย่างไร?":"ร้าน / บริษัทตอบว่าอย่างไร?";
}
function fillCarrierAsCompany(){
  const carrier=shippingCarrierName();
  if(!carrier){showToast("กรุณาเลือกหรือกรอกชื่อบริษัทขนส่งก่อน");return}
  const field=document.getElementById("company");
  if(field.value.trim()&&field.value.trim()!==carrier){
    if(!confirm("ชื่อผู้ถูกร้องเรียนมีข้อมูลอยู่แล้ว ต้องการเปลี่ยนเป็นชื่อบริษัทขนส่งใช่หรือไม่?"))return;
  }
  field.value=carrier;
  saveDraft();
  showToast(`เพิ่มชื่อผู้ถูกร้องเรียน: ${carrier}`);
}
function parcelCaseFacts(){
  if(!isParcelCase())return [];
  const facts=[];
  if(shippingCarrierName())facts.push(`ผู้ให้บริการขนส่ง: ${shippingCarrierName()}`);
  if(valueOf("trackingNumber"))facts.push(`เลขพัสดุ: ${valueOf("trackingNumber")}`);
  if(valueOf("parcelRole"))facts.push(`สถานะผู้ร้องในเหตุการณ์: ${valueOf("parcelRole")}`);
  if(valueOf("parcelClaimNumber")&&radioValue("contactedBusiness")==="ติดต่อแล้ว")facts.push(`เลขอ้างอิงเรื่องที่แจ้งบริษัทขนส่ง: ${valueOf("parcelClaimNumber")}`);
  return facts;
}

function updateContactFields(){
  const wrap=document.getElementById("contactOutcomeWrap");
  if(!wrap)return;
  wrap.classList.toggle("hidden",radioValue("contactedBusiness")!=="ติดต่อแล้ว");
  updateParcelFields();
}
function updateWizardReview(){
  const box=document.getElementById("wizardReview");
  if(!box)return;
  const amount=valueOf("amountPaid")
    ? `${Number(valueOf("amountPaid")).toLocaleString("th-TH")} บาท`
    : "ไม่ได้ระบุ";
  const requests=checkedValues("request").join(", ")||"ยังไม่ได้เลือก";
  box.innerHTML=`
    <strong>สรุปก่อนเข้าสู่ขั้นต่อไป</strong><br>
    ปัญหา: ${escapeHTML(valueOf("category")||"-")}<br>
    สินค้า/บริการ: ${escapeHTML(valueOf("subject")||"-")}<br>
    จำนวนเงินที่ชำระ: ${escapeHTML(amount)}<br>
    ต้องการ: ${escapeHTML(requests)}
  `;
}
function completeWizard(){
  if(!validateWizardQuestion(7))return;
  trackEvent("wizard_q7_complete");
  nextStep(1);
}
function continueDraft(){trackEvent("continue_draft");showForm();restoreDraft()}
function showForm(){document.getElementById("homePage").classList.remove("active-page");document.getElementById("formPage").classList.add("active-page");window.scrollTo({top:0})}
function goHome(){forceSaveNow();document.getElementById("formPage").classList.remove("active-page");document.getElementById("homePage").classList.add("active-page");window.scrollTo({top:0})}
function valueOf(id){const e=document.getElementById(id);return e?e.value.trim():""}
function checkedValues(name){return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(i=>i.value)}
function selectedText(id){const e=document.getElementById(id);if(!e||!e.value)return "";return e.options[e.selectedIndex].textContent.trim()}
function setSaveStatus(text,type=""){const e=document.getElementById("saveStatus");e.textContent=text;e.className="save-status";if(type)e.classList.add(type)}
function scheduleAutoSave(){clearTimeout(autoSaveTimer);setSaveStatus("กำลังพิมพ์...","typing");autoSaveTimer=setTimeout(()=>saveDraft(),AUTO_SAVE_DELAY)}
function saveDraft(showMessage=false){clearTimeout(autoSaveTimer);setSaveStatus("กำลังบันทึก...","saving");try{localStorage.setItem(STORAGE_KEY,JSON.stringify(getDraftData()));updateContinueButton();setSaveStatus("บันทึกแล้ว ✓");clearTimeout(saveStatusTimer);saveStatusTimer=setTimeout(()=>setSaveStatus("บันทึกอัตโนมัติ: เปิด"),1600);if(showMessage)showToast("บันทึกแบบร่างเรียบร้อยแล้ว")}catch(error){console.error(error);setSaveStatus("บันทึกไม่สำเร็จ")}}
function forceSaveNow(){clearTimeout(autoSaveTimer);saveDraft()}
function getDraftData(){
  return{
    version:21,
    currentStep,
    wizardQuestion:currentWizardQuestion,
    name:valueOf("name"),
    category:valueOf("category"),
    subject:valueOf("subject"),
    amountPaid:valueOf("amountPaid"),
    incidentDate:valueOf("incidentDate"),
    problem:valueOf("problem"),
    damage:valueOf("damage"),
    requestDetail:valueOf("requestDetail"),
    contactedBusiness:radioValue("contactedBusiness"),
    contactOutcome:valueOf("contactOutcome"),
    contactDate:valueOf("contactDate"),
    shippingCarrier:valueOf("shippingCarrier"),
    shippingCarrierOther:valueOf("shippingCarrierOther"),
    trackingNumber:valueOf("trackingNumber"),
    parcelRole:valueOf("parcelRole"),
    parcelClaimNumber:valueOf("parcelClaimNumber"),
    company:valueOf("company"),
    companyDetail:valueOf("companyDetail"),
    address:valueOf("address"),
    province:valueOf("province"),
    district:valueOf("district"),
    subDistrict:valueOf("subDistrict"),
    postcode:valueOf("postcode"),
    companyPhone:valueOf("companyPhone"),
    companyChannel:valueOf("companyChannel"),
    payment:checkedValues("payment"),
    request:checkedValues("request"),
    place:checkedValues("place")
  }
}
async function loadThaiAddressData(){const s=document.getElementById("addressStatus");try{s.textContent="กำลังโหลดข้อมูลที่อยู่...";const r=await Promise.all([fetch(PROVINCE_URL),fetch(DISTRICT_URL),fetch(SUB_DISTRICT_URL)]);if(!r[0].ok||!r[1].ok||!r[2].ok)throw new Error("Address data error");provinces=await r[0].json();districts=await r[1].json();subDistricts=await r[2].json();createProvinceOptions();s.className="address-status success";s.textContent="ข้อมูลจังหวัดพร้อมใช้งาน ✓";return true}catch(error){console.error(error);s.className="address-status error";s.textContent="ไม่สามารถโหลดข้อมูลจังหวัดได้ กรุณาตรวจสอบอินเทอร์เน็ต";return false}}
function createProvinceOptions(){const s=document.getElementById("province");s.innerHTML='<option value="">-- เลือกจังหวัด --</option>';provinces.forEach(p=>{const o=document.createElement("option");o.value=String(p.id);o.textContent=p.name.th;s.appendChild(o)});s.disabled=false}
function provinceChanged(shouldSave=true){const pid=Number(valueOf("province")),d=document.getElementById("district"),sd=document.getElementById("subDistrict");d.innerHTML='<option value="">-- เลือกอำเภอ / เขต --</option>';sd.innerHTML='<option value="">-- กรุณาเลือกอำเภอก่อน --</option>';d.disabled=true;sd.disabled=true;document.getElementById("postcode").value="";if(!pid){if(shouldSave)saveDraft();return}districts.filter(i=>Number(i.province_id)===pid).forEach(i=>{const o=document.createElement("option");o.value=String(i.id);o.textContent=`${i.prefix?.th||""}${i.name.th}`;d.appendChild(o)});d.disabled=false;if(shouldSave)saveDraft()}
function districtChanged(shouldSave=true){const did=Number(valueOf("district")),s=document.getElementById("subDistrict");s.innerHTML='<option value="">-- เลือกตำบล / แขวง --</option>';s.disabled=true;document.getElementById("postcode").value="";if(!did){if(shouldSave)saveDraft();return}subDistricts.filter(i=>Number(i.district_id)===did).forEach(i=>{const o=document.createElement("option");o.value=String(i.id);o.textContent=`${i.prefix?.th||""}${i.name.th}`;s.appendChild(o)});s.disabled=false;if(shouldSave)saveDraft()}
function subDistrictChanged(shouldSave=true){const id=Number(valueOf("subDistrict")),p=document.getElementById("postcode"),s=document.getElementById("addressStatus");p.value="";if(!id){s.className="address-status";s.textContent="กรุณาเลือกตำบล / แขวง";return}const selected=subDistricts.find(i=>Number(i.id)===id);if(!selected)return;p.value=selected.zip_code?String(selected.zip_code):"";s.className="address-status success";s.textContent=`${selectedText("subDistrict")} • รหัสไปรษณีย์ ${p.value||"-"}`;if(shouldSave)saveDraft()}
function getFullAddress(){const parts=[];if(valueOf("address"))parts.push(valueOf("address"));if(selectedText("subDistrict"))parts.push(selectedText("subDistrict"));if(selectedText("district"))parts.push(selectedText("district"));if(selectedText("province"))parts.push("จังหวัด"+selectedText("province"));if(valueOf("postcode"))parts.push(valueOf("postcode"));return parts.join(" ")}
function createUploadFields(){const c=document.getElementById("uploadList");c.innerHTML="";evidenceTypes.forEach((type,index)=>{const card=document.createElement("div");card.className="upload-card";card.innerHTML=`<h3>${type}</h3><input type="file" id="file${index}" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onchange="validateFile(${index})"><div id="status${index}" class="file-status">ยังไม่ได้เลือกไฟล์</div>`;c.appendChild(card)})}
function validateFile(index){const input=document.getElementById(`file${index}`),status=document.getElementById(`status${index}`);if(!input.files.length){status.className="file-status";status.textContent="ยังไม่ได้เลือกไฟล์";return}const file=input.files[0],ext=file.name.split(".").pop().toLowerCase();if(!allowedExtensions.includes(ext)){status.className="file-status file-error";status.textContent="ไม่รองรับไฟล์ประเภทนี้";input.value="";return}if(file.size>maxFileSize){status.className="file-status file-error";status.textContent="ไฟล์มีขนาดเกิน 5 MB";input.value="";return}status.className="file-status file-ok";status.textContent=`พร้อมใช้งาน ✓ ${file.name}`}
function getSelectedFiles(){const files=[];evidenceTypes.forEach((type,index)=>{const input=document.getElementById(`file${index}`);if(input&&input.files&&input.files.length){files.push({type,name:input.files[0].name})}});return files}
function formatThaiDate(dateString){
  if(!dateString)return "";
  try{
    const date=new Date(`${dateString}T00:00:00`);
    return new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"long",year:"numeric"}).format(date);
  }catch{
    return dateString;
  }
}
function moneyText(value){
  if(!value)return "";
  const number=Number(value);
  if(Number.isNaN(number))return value;
  return `${number.toLocaleString("th-TH",{maximumFractionDigits:2})} บาท`;
}
function requestSentence(){
  const requests=checkedValues("request");
  let text=requests.length?requests.join(", "):"ขอให้พิจารณาแก้ไขปัญหาตามความเหมาะสม";
  if(valueOf("requestDetail"))text+=` โดย ${valueOf("requestDetail")}`;
  return text;
}
function complaintFacts(){
  const facts=[];
  if(valueOf("subject"))facts.push(`สินค้า/บริการที่เกี่ยวข้อง: ${valueOf("subject")}`);
  if(valueOf("incidentDate"))facts.push(`วันที่เกิดเหตุ: ${formatThaiDate(valueOf("incidentDate"))}`);
  if(valueOf("amountPaid"))facts.push(`จำนวนเงินที่ชำระ: ${moneyText(valueOf("amountPaid"))}`);
  if(checkedValues("payment").length)facts.push(`วิธีการชำระเงิน: ${checkedValues("payment").join(", ")}`);
  if(valueOf("company"))facts.push(`ผู้ประกอบการ/ผู้ถูกร้องเรียน: ${valueOf("company")}`);
  if(valueOf("damage"))facts.push(`มูลค่าความเสียหายที่ระบุ: ${moneyText(valueOf("damage"))}`);
  facts.push(...parcelCaseFacts());
  return facts;
}
function buildGeneratedComplaint(tone=currentComplaintTone){
  const name=valueOf("name")||"[ชื่อผู้ร้องเรียน]";
  const category=valueOf("category")||"ปัญหาสินค้าหรือบริการ";
  const subject=valueOf("subject")||"สินค้า/บริการ";
  const problem=valueOf("problem")||"[กรุณาระบุรายละเอียดเหตุการณ์]";
  const company=valueOf("company")||"ผู้ประกอบการ";
  const contacted=radioValue("contactedBusiness");
  const contactOutcome=valueOf("contactOutcome");
  const paid=valueOf("amountPaid")?moneyText(valueOf("amountPaid")):"";
  const incident=valueOf("incidentDate")?formatThaiDate(valueOf("incidentDate")):"";
  const payment=checkedValues("payment").join(", ");
  const requests=requestSentence();
  const parcelLine=parcelCaseFacts().length?`\n\nข้อมูลการจัดส่ง\n${parcelCaseFacts().join("\n")}`:"";

  let contactText="";
  if(contacted==="ติดต่อแล้ว"){
    contactText=`ข้าพเจ้าได้ติดต่อ ${company} เพื่อขอให้แก้ไขปัญหาแล้ว`;
    if(contactOutcome)contactText+=` โดยได้รับคำตอบ/ผลการติดต่อว่า ${contactOutcome}`;
    if(valueOf("contactDate"))contactText+=` เมื่อวันที่ ${formatThaiDate(valueOf("contactDate"))}`;
    contactText+=".";
  }else if(contacted==="ยังไม่ได้ติดต่อ"){
    contactText=isParcelCase()?"ขณะจัดทำข้อความนี้ ข้าพเจ้ายังไม่ได้ติดต่อบริษัทขนส่งเพื่อขอให้ตรวจสอบปัญหาโดยตรง.":`ขณะจัดทำข้อความนี้ ข้าพเจ้ายังไม่ได้ติดต่อ ${company} เพื่อขอให้แก้ไขปัญหาโดยตรง.`;
  }

  if(tone==="polite"){
    let text=`เรื่อง ขอความกรุณาช่วยแก้ไขปัญหาเกี่ยวกับ ${subject}\n\nเรียน ${company}\n\nข้าพเจ้า ${name} ขอแจ้งปัญหาเกี่ยวกับ ${subject}`;
    if(incident)text+=` ซึ่งเกิดขึ้นเมื่อวันที่ ${incident}`;
    if(paid)text+=` โดยมีมูลค่าที่ชำระ ${paid}`;
    if(payment)text+=` ชำระผ่าน ${payment}`;
    text+=`.\n\nรายละเอียดปัญหา\n${problem}`;
    if(parcelLine)text+=parcelLine;
    if(contactText)text+=`\n\n${contactText}`;
    text+=`\n\nสิ่งที่ต้องการให้ช่วยดำเนินการ\n${requests}`;
    text+=`\n\nจึงขอความกรุณาตรวจสอบและแจ้งแนวทางแก้ไขให้ทราบ หากต้องการข้อมูลหรือหลักฐานเพิ่มเติม ข้าพเจ้ายินดีจัดส่งให้เพื่อประกอบการพิจารณา\n\nขอบคุณครับ/ค่ะ\n${name}`;
    return text;
  }

  if(tone==="formal"){
    let text=`เรื่อง ขอให้ดำเนินการแก้ไขกรณี ${category}\n\nเรียน ${company}\n\nข้าพเจ้า ${name} ขอแจ้งข้อร้องเรียนเกี่ยวกับ ${subject}`;
    if(incident)text+=` โดยเหตุเกิดเมื่อวันที่ ${incident}`;
    if(paid)text+=` และมีจำนวนเงินที่ชำระ ${paid}`;
    text+=`.\n\nข้อเท็จจริง\n${problem}`;
    if(parcelLine)text+=parcelLine;
    if(contactText)text+=`\n\nการติดต่อผู้ประกอบการ\n${contactText}`;
    text+=`\n\nความประสงค์\n${requests}`;
    if(valueOf("damage"))text+=`\n\nมูลค่าความเสียหายที่ระบุ: ${moneyText(valueOf("damage"))}`;
    text+=`\n\nจึงขอให้ตรวจสอบข้อเท็จจริงและดำเนินการแก้ไข พร้อมแจ้งผลให้ข้าพเจ้าทราบตามช่องทางที่เหมาะสม\n\nขอแสดงความนับถือ\n${name}`;
    return text;
  }

  let text=`เรื่อง ขอให้ตรวจสอบและช่วยเหลือกรณี ${category}\n\nเรียน หน่วยงานที่เกี่ยวข้อง\n\nข้าพเจ้า ${name} ขอร้องเรียนเกี่ยวกับ ${subject}`;
  if(valueOf("company"))text+=` ซึ่งเกี่ยวข้องกับ ${company}`;
  text+=` โดยมีข้อเท็จจริงดังนี้\n\n${problem}`;

  const facts=complaintFacts();
  if(facts.length)text+=`\n\nข้อมูลประกอบ\n${facts.map(item=>`• ${item}`).join("\n")}`;
  if(contactText)text+=`\n\nการติดต่อผู้ประกอบการ\n${contactText}`;
  text+=`\n\nความประสงค์ของผู้ร้อง\n${requests}`;
  text+=`\n\nจึงขอให้หน่วยงานที่เกี่ยวข้องตรวจสอบข้อเท็จจริง และพิจารณาให้ความช่วยเหลือตามอำนาจหน้าที่ต่อไป\n\nขอแสดงความนับถือ\n${name}`;
  return text;
}
function setComplaintTone(tone,button){
  if(!["polite","formal","official"].includes(tone))return;
  currentComplaintTone=tone;
  document.querySelectorAll(".tone-button").forEach(item=>item.classList.toggle("active",item.dataset.tone===tone));
  const box=document.getElementById("generatedComplaint");
  if(box)box.textContent=buildGeneratedComplaint(tone);
}
function copyGeneratedComplaint(){
  trackEvent("copy_complaint");
  copyText(buildGeneratedComplaint(currentComplaintTone),"คัดลอกข้อความร้องเรียนแล้ว");
}
function hasEvidence(keyword){return getSelectedFiles().some(item=>item.type.includes(keyword))}
function getEvidenceRecommendations(){
  if(isParcelCase())return [
    {label:"เลขพัสดุหรือหลักฐานการส่ง (ถ้ามี)",passed:Boolean(valueOf("trackingNumber"))},
    {label:"ภาพกล่องพัสดุภายนอกและวัสดุกันกระแทก",passed:hasEvidence("ภาพถ่าย")},
    {label:"ภาพความเสียหายของสินค้า",passed:hasEvidence("ภาพถ่าย")},
    {label:"ใบเสร็จ / หลักฐานมูลค่าสินค้า",passed:hasEvidence("ใบเสร็จ")||hasEvidence("ชำระเงิน")},
    {label:"ผลการติดต่อบริษัทขนส่ง (แชต / อีเมล / เลขเคส)",passed:hasEvidence("การสนทนา")||Boolean(valueOf("parcelClaimNumber"))},
  ];
  const c=valueOf("category");
  const list=[{label:"หลักฐานการชำระเงิน / ใบเสร็จ",passed:hasEvidence("ชำระเงิน")||hasEvidence("ใบเสร็จ")},{label:"ภาพถ่ายสินค้า / ความเสียหาย",passed:hasEvidence("ภาพถ่าย")},{label:"หลักฐานการสนทนากับร้านหรือบริษัท",passed:hasEvidence("การสนทนา")}];
  if(c==="โฆษณาไม่ตรงความจริง")list.push({label:"ภาพหรือเอกสารโฆษณาที่ใช้เปรียบเทียบ",passed:hasEvidence("โฆษณา")});
  if(c==="ร้านค้าออนไลน์")list.push({label:"เลขที่คำสั่งซื้อหรือหลักฐานการสั่งซื้อ",passed:hasEvidence("คำสั่งซื้อ")});
  return list;
}
function improveComplaint(){
  showToast("ระบบใช้ Wizard และสร้างข้อความให้อัตโนมัติที่หน้าผลลัพธ์");
}
function nextStep(step){
  if(step===1){
    if(!valueOf("name")){showToast("กรุณากรอกชื่อผู้ร้องเรียน");return}
    if(!valueOf("category")){showToast("กรุณาเลือกประเภทปัญหา");return}
    if(!valueOf("subject")){showToast("กรุณาระบุสินค้า หรือบริการ");return}
    if(valueOf("problem").length<10){showToast("กรุณากรอกรายละเอียดเรื่องร้องเรียน");return}
    if(checkedValues("request").length===0){showToast("กรุณาเลือกสิ่งที่ต้องการให้แก้ไข");return}
  }

  if(step===2&&!valueOf("company")){
    showToast("กรุณากรอกชื่อผู้ถูกร้องเรียน");
    return
  }

  if(step===1)trackEvent("step_1_complete");
  if(step===2)trackEvent("step_2_complete");

  if(step===3){
    trackEvent("step_3_complete");
    createFinalReview();
  }

  showStep(step+1);

  if(step===3)trackEvent("result_view");
  forceSaveNow();
}
function previousStep(step){showStep(step-1);forceSaveNow()}
function showStep(step){
  currentStep=step;
  document.querySelectorAll(".step").forEach(i=>i.classList.remove("active"));
  document.getElementById(`step${step}`).classList.add("active");
  updateProgress();
  if(step===1){
    syncCategoryButtons();
    updateContactFields();
  }
  if(step===4)createFinalReview();
  window.scrollTo({top:0,behavior:"smooth"});
}
function updateProgress(){for(let i=1;i<=4;i++){const item=document.getElementById(`progress${i}`);item.classList.remove("active","completed");if(i===currentStep)item.classList.add("active");if(i<currentStep)item.classList.add("completed")}}

const AGENCIES={
  ocpb:{
    name:"สำนักงานคณะกรรมการคุ้มครองผู้บริโภค (สคบ.)",
    short:"สคบ.",
    url:"https://complaint.ocpb.go.th/",
    reason:"เหมาะกับข้อพิพาทผู้บริโภคทั่วไปเกี่ยวกับสินค้า บริการ ผู้ประกอบการ และการเยียวยาผู้บริโภค",
    event:"route_open_ocpb"
  },
  etda:{
    name:"1212 ETDA",
    short:"1212 ETDA",
    url:"https://1212.etda.or.th/ComplainFlow/Services",
    reason:"เหมาะกับปัญหาซื้อขายออนไลน์ เว็บไซต์ผิดกฎหมาย ภัยออนไลน์ และปัญหาดิจิทัลบางประเภท",
    event:"route_open_etda"
  },
  nbtc:{
    name:"สำนักงาน กสทช. — คุ้มครองผู้บริโภคด้านโทรคมนาคม",
    short:"กสทช.",
    url:"https://tcp.nbtc.go.th/th/complaint/complaint-nbtc.aspx",
    reason:"เหมาะกับปัญหาผู้ให้บริการโทรศัพท์มือถือ อินเทอร์เน็ต และบริการโทรคมนาคม",
    event:"route_open_nbtc"
  },
  oic:{
    name:"สำนักงาน คปภ. — ระบบรับเรื่องร้องเรียนด้านประกันภัย",
    short:"คปภ.",
    url:"https://complaintportal.oic.or.th/",
    reason:"เหมาะกับข้อพิพาทหรือปัญหาที่เกี่ยวข้องกับบริษัทประกันภัย ตัวแทน นายหน้า หรือการเคลมประกัน",
    event:"route_open_oic"
  },
  thpost:{
    name:"ไปรษณีย์ไทย — แจ้งสอบสวน/ร้องเรียนบริการ",
    short:"ไปรษณีย์ไทย",
    url:"https://www.thailandpost.co.th/un/form/complaints/?form_id=3",
    reason:"แจ้งเลขพัสดุ รายละเอียดเหตุ และขอให้บริษัทตรวจสอบก่อน โดยติดต่อ 1545 หรือที่ทำการไปรษณีย์ที่เกี่ยวข้องได้",
    event:"route_open_thpost"
  },
  gov1111:{
    name:"ศูนย์รับเรื่องราวร้องทุกข์ของรัฐบาล 1111",
    short:"1111",
    url:"https://www.1111.go.th/",
    reason:"ช่องทางรับเรื่องร้องทุกข์ ประสานหน่วยงานภาครัฐและติดตามเรื่องตามขอบเขตที่รับผิดชอบ",
    event:"route_open_1111"
  },
  police:{
    name:"Thai Police Online — แจ้งความออนไลน์คดีอาชญากรรมทางเทคโนโลยี",
    short:"ตำรวจออนไลน์",
    url:"https://www.thaipoliceonline.go.th/",
    reason:"สำหรับกรณีที่เข้าลักษณะอาชญากรรมทางเทคโนโลยี ต้องตรวจสอบขอบเขตและเงื่อนไขก่อนแจ้งความ",
    event:"route_open_police"
  },
  bot:{
    name:"ธนาคารแห่งประเทศไทย — บริการช่วยเหลือ/ร้องเรียน",
    short:"ธปท.",
    url:"https://services.bot.or.th/",
    reason:"เหมาะกับปัญหาการใช้บริการทางการเงิน สถาบันการเงิน การชำระเงิน หรือการให้บริการทางการเงินที่ไม่เป็นธรรม",
    event:"route_open_bot"
  }
};

function getRoutingRecommendation(){
  const category=valueOf("category");
  const subject=(valueOf("subject")+" "+valueOf("problem")).toLowerCase();

  if(category==="โทรศัพท์หรืออินเทอร์เน็ต")return {primary:"nbtc",secondary:["ocpb"]};
  if(category==="ประกันภัย")return {primary:"oic",secondary:["ocpb"]};
  if(category==="ธนาคารหรือการเงิน")return {primary:"bot",secondary:["ocpb"]};
  if(["ร้านค้าออนไลน์","ไม่ได้รับสินค้า","โฆษณาไม่ตรงความจริง"].includes(category)){
    return {primary:"etda",secondary:["ocpb"]};
  }

  const telecomWords=["มือถือ","โทรศัพท์","อินเทอร์เน็ต","เน็ตบ้าน","ซิม","เครือข่าย"];
  const insuranceWords=["ประกัน","เคลม","กรมธรรม์","ประกันภัย"];
  const financeWords=["ธนาคาร","บัตรเครดิต","สินเชื่อ","บัญชี","การเงิน","โอนเงิน","payment"];

  if(telecomWords.some(word=>subject.includes(word)))return {primary:"nbtc",secondary:["ocpb"]};
  if(insuranceWords.some(word=>subject.includes(word)))return {primary:"oic",secondary:["ocpb"]};
  if(financeWords.some(word=>subject.includes(word)))return {primary:"bot",secondary:["ocpb"]};

  return {primary:"ocpb",secondary:[]};
}

function openAgency(key){
  const agency=AGENCIES[key];
  if(!agency)return;
  trackEvent(agency.event);
  window.open(agency.url,"_blank","noopener");
}

function renderParcelRouting(){
  const box=document.getElementById("routingResult");
  const carrier=shippingCarrierName();
  const contacted=radioValue("contactedBusiness")==="ติดต่อแล้ว";
  const isThailandPost=carrier==="ไปรษณีย์ไทย";
  const answered=Boolean(valueOf("contactOutcome"));
  const primaryAction=isThailandPost&&!contacted
    ?`<button type="button" class="ocpb-button route-button" onclick="openAgency('thpost')">เปิดแบบฟอร์มร้องเรียนไปรษณีย์ไทย →</button>`
    :"";
  const providerGuidance=isThailandPost
    ?"ติดต่อที่ทำการไปรษณีย์ที่เกี่ยวข้องหรือ THP Contact Center 1545 และเก็บเลขรับเรื่องไว้"
    :carrier?`ติดต่อ ${escapeHTML(carrier)} ผ่านช่องทางช่วยเหลือทางการที่คุณตรวจสอบได้ และเก็บเลขเคส/แชตไว้`:
    "ตรวจสอบใบเสร็จหรือเลขพัสดุเพื่อระบุบริษัทขนส่งก่อน แล้วแจ้งปัญหากับผู้ให้บริการ";
  let html=`<div class="route-primary"><span class="route-badge">${contacted?"ตรวจสอบผลการร้องเรียนกับบริษัท":"ขั้นตอนแรกที่แนะนำ"}</span><div class="route-title">📦 ${contacted?"ตรวจสอบผลการติดต่อบริษัทขนส่ง":"ติดต่อบริษัทขนส่งก่อน"}</div><p class="route-reason">${providerGuidance}${contacted?" หากยังไม่ได้รับการแก้ไขให้ตรวจสอบช่องทางร้องทุกข์ผู้บริโภคด้านล่าง":""}</p>${primaryAction}</div>`;
  if(isThailandPost&&contacted){
    html+=`<div class="route-secondary"><span class="route-badge">กลับไปติดตามบริษัท</span><div class="route-title">ไปรษณีย์ไทย / 1545</div><p class="route-reason">ติดตามผลผ่านช่องทางรับเรื่องของไปรษณีย์ไทย หากยังไม่ได้คำตอบหรือยังไม่สามารถแก้ไขได้</p><button type="button" class="secondary-action-button route-button" onclick="openAgency('thpost')">ช่องทางร้องเรียนไปรษณีย์ไทย →</button></div>`;
  }
  html+=`<div class="route-secondary"><span class="route-badge">ช่องทางร้องทุกข์ผู้บริโภค หากยังแก้ไขไม่ได้</span><div class="route-title">สำนักงานคณะกรรมการคุ้มครองผู้บริโภค (สคบ.)</div><p class="route-reason">สำหรับข้อพิพาทผู้บริโภคที่เกี่ยวกับการให้บริการขนส่ง ควรตรวจสอบข้อเท็จจริง ผู้ถูกร้อง และขอบเขตที่ สคบ. รับพิจารณาก่อนยื่น</p><button type="button" class="secondary-action-button route-button" onclick="openAgency('ocpb')">ตรวจสอบช่องทาง สคบ. →</button></div>`;
  html+=`<p class="parcel-route-note">${answered?"คุณระบุผลการติดต่อไว้แล้ว ควรแนบหลักฐานข้อความตอบกลับประกอบคำร้องด้วย":"หากได้รับข้อเสนอชดเชย โปรดเก็บเอกสาร/ข้อความระบุจำนวนเงินและเงื่อนไขไว้"} ความรับผิดและสิทธิรับเงินชดเชยอาจขึ้นกับผู้ส่ง/ผู้รับ ประเภทบริการ และเงื่อนไขการฝากส่ง</p>`;
  box.innerHTML=html;
}
function renderRouting(){
  if(isParcelCase()){renderParcelRouting();return}
  const box=document.getElementById("routingResult");
  if(!box)return;

  const route=getRoutingRecommendation();
  const primary=AGENCIES[route.primary];
  const secondary=route.secondary.map(key=>({key,...AGENCIES[key]}));

  let html=`
    <div class="route-primary">
      <span class="route-badge">แนะนำเป็นช่องทางหลัก</span>
      <div class="route-title">🎯 ${escapeHTML(primary.name)}</div>
      <p class="route-reason">${escapeHTML(primary.reason)}</p>
      <button type="button" class="ocpb-button route-button" onclick="openAgency('${route.primary}')">ไปเว็บไซต์ทางการของ ${escapeHTML(primary.short)} →</button>
    </div>`;

  secondary.forEach(item=>{
    html+=`
      <div class="route-secondary">
        <span class="route-badge">ทางเลือกเพิ่มเติม</span>
        <div class="route-title">${escapeHTML(item.name)}</div>
        <p class="route-reason">${escapeHTML(item.reason)}</p>
        <button type="button" class="secondary-action-button route-button" onclick="openAgency('${item.key}')">ดูช่องทาง ${escapeHTML(item.short)} →</button>
      </div>`;
  });

  box.innerHTML=html;
}

function renderNextSteps(){
  const box=document.getElementById("nextSteps");
  if(!box)return;
  if(isParcelCase()){
    const company=shippingCarrierName()||"ผู้ให้บริการขนส่ง";
    const already=radioValue("contactedBusiness")==="ติดต่อแล้ว";
    box.innerHTML=`
      <div class="next-step-item"><div class="next-step-number">1</div><div><strong>รักษาหลักฐานความเสียหาย</strong><br><span class="muted">ถ่ายรูปกล่อง ใบปะหน้า ของภายใน ใบเสร็จ และเก็บบรรจุภัณฑ์ไว้ก่อน</span></div></div>
      <div class="next-step-item"><div class="next-step-number">2</div><div><strong>${already?"ติดตามเลขเคสและผลการชดเชย":"แจ้งความเสียหายกับบริษัทขนส่ง"}</strong><br><span class="muted">${already?"เก็บหลักฐานคำตอบและวันที่ติดต่อทุกครั้ง":`ติดต่อ ${escapeHTML(company)} พร้อมเลขพัสดุและหลักฐานโดยเร็ว`}</span></div></div>
      <div class="next-step-item"><div class="next-step-number">3</div><div><strong>หากแก้ไขไม่ได้ ค่อยพิจารณาช่องทางร้องทุกข์</strong><br><span class="muted">ตรวจสอบสิทธิผู้ส่ง/ผู้รับ เงื่อนไขบริการ และช่องทาง สคบ. ที่แนะนำ</span></div></div>
      <div class="next-step-item"><div class="next-step-number">4</div><div><strong>เก็บเลขอ้างอิงทุกช่องทาง</strong><br><span class="muted">บันทึกวันที่ยื่น เลขรับเรื่อง และผลตอบกลับไว้ติดตาม</span></div></div>`;
    return;
  }
  box.innerHTML=`
    <div class="next-step-item"><div class="next-step-number">1</div><div><strong>ตรวจข้อความและหลักฐาน</strong><br><span class="muted">เช็กชื่อ วันที่ จำนวนเงิน และข้อเท็จจริงก่อนส่ง</span></div></div>
    <div class="next-step-item"><div class="next-step-number">2</div><div><strong>ติดต่อผู้ประกอบการก่อน ถ้าเหมาะสม</strong><br><span class="muted">เก็บแชต อีเมล เลขอ้างอิง หรือหลักฐานการติดต่อไว้</span></div></div>
    <div class="next-step-item"><div class="next-step-number">3</div><div><strong>ยื่นผ่านช่องทางทางการที่แนะนำ</strong><br><span class="muted">ตรวจเงื่อนไขและขอบเขตอำนาจของหน่วยงานก่อนยื่น</span></div></div>
    <div class="next-step-item"><div class="next-step-number">4</div><div><strong>เก็บเลขรับเรื่องและวันที่ยื่น</strong><br><span class="muted">ใช้สำหรับติดตามความคืบหน้าภายหลัง</span></div></div>`;
}

function calculateReadiness(){
  const files=getSelectedFiles();
  const paymentRelevant=Boolean(valueOf("amountPaid"));
  const checks=[
    {name:"ชื่อผู้ร้องเรียน",passed:Boolean(valueOf("name"))},
    {name:"ประเภทปัญหา",passed:Boolean(valueOf("category"))},
    {name:"สินค้า / บริการ",passed:Boolean(valueOf("subject"))},
    {name:"รายละเอียดเหตุการณ์",passed:valueOf("problem").length>=20},
    {name:"วันที่เกิดเหตุ",passed:Boolean(valueOf("incidentDate"))},
    {name:"ความประสงค์",passed:checkedValues("request").length>0},
    {name:"สถานะการติดต่อผู้ประกอบการ",passed:Boolean(radioValue("contactedBusiness"))},
    {name:"ชื่อผู้ถูกร้องเรียน",passed:Boolean(valueOf("company"))},
    {name:paymentRelevant?"วิธีการชำระเงิน":"จำนวนเงิน / การชำระเงิน (ถ้าเกี่ยวข้อง)",passed:paymentRelevant?checkedValues("payment").length>0:true},
    {name:"หลักฐานประกอบ",passed:files.length>0}
  ];
  if(isParcelCase()){
    checks.push({name:"ชื่อบริษัทขนส่ง (ถ้าทราบ)",passed:Boolean(shippingCarrierName())});
    checks.push({name:"เลขพัสดุ (ถ้ามี)",passed:Boolean(valueOf("trackingNumber"))});
    if(radioValue("contactedBusiness")==="ติดต่อแล้ว"){
      checks.push({name:"วันที่ติดต่อบริษัท (ถ้าทราบ)",passed:Boolean(valueOf("contactDate"))});
    }
  }
  const passed=checks.filter(i=>i.passed).length;
  return{score:Math.round((passed/checks.length)*100),checks}
}
function createFinalReview(){
  const result=calculateReadiness();
  document.getElementById("readinessScore").textContent=`${result.score}%`;
  document.getElementById("scoreBar").style.width=`${result.score}%`;
  document.getElementById("readinessStatus").textContent=result.score>=90?"พร้อมมาก":result.score>=70?"เกือบพร้อม":result.score>=50?"ควรตรวจเพิ่ม":"ข้อมูลยังไม่ครบ";
  document.getElementById("readinessChecklist").innerHTML=result.checks.map(i=>`<div class="check-item ${i.passed?"ok":"missing"}">${i.passed?"✓":"!"} ${escapeHTML(i.name)}</div>`).join("");

  const evidence=getEvidenceRecommendations();
  document.getElementById("evidenceChecklist").innerHTML=`<h4>หลักฐานที่อาจเป็นประโยชน์ (ถ้ามี)</h4><p class="evidence-note">เครื่องหมายว่ามีแล้วหมายถึงคุณเลือกไฟล์ในหมวดใกล้เคียง หรือระบุเลขพัสดุ ระบบยังไม่ได้อ่านหรือตรวจสอบเนื้อหาไฟล์</p>${evidence.map(i=>`<div class="evidence-item ${i.passed?"ok":"missing"}">${i.passed?"✓ มีแล้ว":"• ควรเพิ่ม"} — ${escapeHTML(i.label)}</div>`).join("")}`;

  const missing=result.checks.filter(i=>!i.passed);
  const warning=document.getElementById("missingWarning");
  const action=document.getElementById("missingAction");
  const actionText=document.getElementById("missingActionText");

  if(missing.length){
    warning.classList.add("show");
    warning.innerHTML=`<strong>ยังขาด ${missing.length} รายการ</strong><br><br>${missing.map(i=>`• ${escapeHTML(i.name)}`).join("<br>")}`;
    action.classList.remove("hidden");
    actionText.textContent=`ควรเติมก่อนยื่น: ${missing.slice(0,3).map(i=>i.name).join(", ")}${missing.length>3?" และรายการอื่น ๆ":""}`;
  }else{
    warning.classList.remove("show");
    warning.innerHTML="";
    action.classList.add("hidden");
  }

  document.getElementById("generatedComplaint").textContent=buildGeneratedComplaint(currentComplaintTone);
  createSummary();
  renderRouting();
  renderNextSteps();
}

function getFirstMissingTarget(){
  const result=calculateReadiness();
  const missing=result.checks.find(i=>!i.passed);
  if(!missing)return null;

  const map={
    "ชื่อผู้ร้องเรียน":{step:1,wizard:7},
    "ประเภทปัญหา":{step:1,wizard:1},
    "สินค้า / บริการ":{step:1,wizard:2},
    "รายละเอียดเหตุการณ์":{step:1,wizard:4},
    "วันที่เกิดเหตุ":{step:1,wizard:4},
    "ความประสงค์":{step:1,wizard:6},
    "สถานะการติดต่อผู้ประกอบการ":{step:1,wizard:5},
    "ชื่อผู้ถูกร้องเรียน":{step:2},
    "วิธีการชำระเงิน":{step:1,wizard:3},
    "จำนวนเงิน / การชำระเงิน (ถ้าเกี่ยวข้อง)":{step:1,wizard:3},
    "หลักฐานประกอบ":{step:3},
    "ชื่อบริษัทขนส่ง (ถ้าทราบ)":{step:1,wizard:5},
    "เลขพัสดุ (ถ้ามี)":{step:1,wizard:5},
    "วันที่ติดต่อบริษัท (ถ้าทราบ)":{step:1,wizard:5}
  };
  return map[missing.name]||{step:1,wizard:1};
}

function goToFirstMissing(){
  trackEvent("go_fill_missing");
  const target=getFirstMissingTarget();
  if(!target){showToast("ข้อมูลหลักครบแล้ว");return}
  showStep(target.step);
  if(target.step===1&&target.wizard)setWizardQuestion(target.wizard);
}

function createSummary(){
  const files=getSelectedFiles();
  const fileText=files.length?files.map(i=>`${i.type}: ${i.name}`).join("\n"):"ยังไม่ได้เลือกไฟล์";
  const damage=valueOf("damage")?moneyText(valueOf("damage")):"ไม่ระบุ";
  const paid=valueOf("amountPaid")?moneyText(valueOf("amountPaid")):"ไม่ระบุ";
  const contacted=radioValue("contactedBusiness")||"ไม่ระบุ";

  document.getElementById("summaryBox").innerHTML=`
    <div class="summary-card">
      <h3>ข้อมูลเรื่องร้องเรียน</h3>
      ${summaryRow("ชื่อผู้ร้องเรียน",valueOf("name"))}
      ${summaryRow("ประเภทปัญหา",valueOf("category"))}
      ${summaryRow("สินค้า / บริการ",valueOf("subject"))}
      ${summaryRow("จำนวนเงินที่ชำระ",paid)}
      ${summaryRow("วันที่เกิดเหตุ",valueOf("incidentDate")?formatThaiDate(valueOf("incidentDate")):"ไม่ระบุ")}
      ${summaryRow("รายละเอียด",valueOf("problem"))}
      ${summaryRow("การชำระเงิน",checkedValues("payment").join(", ")||"ไม่ระบุ")}
      ${summaryRow("ติดต่อผู้ประกอบการ",contacted)}
      ${summaryRow("ผลการติดต่อ",valueOf("contactOutcome")||"ไม่ระบุ")}
      ${isParcelCase()?summaryRow("ผู้ให้บริการขนส่ง",shippingCarrierName()||"ไม่ระบุ"):""}
      ${isParcelCase()?summaryRow("เลขพัสดุ",valueOf("trackingNumber")||"ไม่ระบุ"):""}
      ${isParcelCase()?summaryRow("ผู้ส่ง/ผู้รับ",valueOf("parcelRole")||"ไม่ระบุ"):""}
      ${isParcelCase()?summaryRow("เลขเคสบริษัทขนส่ง",valueOf("parcelClaimNumber")||"ไม่ระบุ"):""}
      ${summaryRow("วันที่ติดต่อ",valueOf("contactDate")?formatThaiDate(valueOf("contactDate")):"ไม่ระบุ")}
      ${summaryRow("ความประสงค์",checkedValues("request").join(", ")||"ไม่ระบุ")}
      ${summaryRow("รายละเอียดความประสงค์",valueOf("requestDetail")||"ไม่ระบุ")}
      ${summaryRow("มูลค่าความเสียหาย",damage)}
    </div>
    <div class="summary-card">
      <h3>ข้อมูลผู้ถูกร้องเรียน</h3>
      ${summaryRow("ชื่อ",valueOf("company"))}
      ${summaryRow("รายละเอียดเพิ่มเติม",valueOf("companyDetail")||"ไม่ระบุ")}
      ${summaryRow("ที่อยู่",getFullAddress()||"ไม่ระบุ")}
      ${summaryRow("โทรศัพท์",valueOf("companyPhone")||"ไม่ระบุ")}
      ${summaryRow("ช่องทางออนไลน์",valueOf("companyChannel")||"ไม่ระบุ")}
      ${summaryRow("สถานที่ซื้อหรือใช้บริการ",checkedValues("place").join(", ")||"ไม่ระบุ")}
    </div>
    <div class="summary-card">
      <h3>หลักฐาน</h3>
      ${summaryRow("ไฟล์ที่เตรียมไว้",fileText)}
    </div>`;
}
function summaryRow(title,value){return `<div class="summary-row"><div class="summary-title">${escapeHTML(title)}</div><div class="summary-value">${escapeHTML(value||"ไม่ระบุ")}</div></div>`}
function escapeHTML(text){return String(text).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
async function copyText(text,message="คัดลอกเรียบร้อยแล้ว"){if(!text||!text.trim()){showToast("ยังไม่มีข้อมูลในส่วนนี้");return}try{await navigator.clipboard.writeText(text);showToast(message)}catch{const t=document.createElement("textarea");t.value=text;t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.focus();t.select();document.execCommand("copy");t.remove();showToast(message)}}
function copyField(id){copyText(valueOf(id))}
function copyPayment(){copyText(checkedValues("payment").join(", "),"คัดลอกวิธีการชำระเงินแล้ว")}
function copyRequest(){copyText(checkedValues("request").join(", "),"คัดลอกความประสงค์แล้ว")}
function copyFullAddress(){copyText(getFullAddress(),"คัดลอกที่อยู่แล้ว")}
function buildCopyText(){return `ข้อมูลเตรียมยื่นเรื่องร้องเรียน

${buildGeneratedComplaint("official")}

--------------------------------

ข้อมูลผู้ถูกร้องเรียน

ชื่อ:
${valueOf("company")||"ไม่ระบุ"}

รายละเอียดเพิ่มเติม:
${valueOf("companyDetail")||"ไม่ระบุ"}

ที่อยู่:
${getFullAddress()||"ไม่ระบุ"}

โทรศัพท์:
${valueOf("companyPhone")||"ไม่ระบุ"}

ช่องทางออนไลน์:
${valueOf("companyChannel")||"ไม่ระบุ"}

สถานที่ซื้อหรือใช้บริการ:
${checkedValues("place").join(", ")||"ไม่ระบุ"}

${isParcelCase()?`ข้อมูลขนส่ง:
${parcelCaseFacts().join("\n")||"ไม่ระบุ"}
`:""}

หมายเหตุ:
ข้อมูลนี้จัดทำผ่านเครื่องมือช่วยเตรียมข้อมูลคำร้อง โปรดตรวจสอบข้อเท็จจริงก่อนนำไปยื่นต่อหน่วยงาน`}
function copySummary(){trackEvent("copy_all");copyText(buildCopyText(),"คัดลอกข้อมูลทั้งหมดแล้ว")}
function openOCPB(){openAgency("ocpb")}
function restoreDraft(){
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw){
    showToast("ยังไม่มีแบบร่างที่บันทึกไว้");
    showStep(1);
    setWizardQuestion(1);
    return;
  }

  try{
    const data=JSON.parse(raw);
    const fields=[
      "name","category","subject","amountPaid","incidentDate","problem","damage",
      "requestDetail","contactOutcome","contactDate","shippingCarrier","shippingCarrierOther","trackingNumber","parcelRole","parcelClaimNumber","company","companyDetail","address",
      "companyPhone","companyChannel"
    ];

    fields.forEach(id=>{
      const field=document.getElementById(id);
      if(field&&data[id]!==undefined)field.value=data[id]||"";
    });

    restoreChecks("payment",data.payment);
    restoreChecks("request",data.request);
    restoreChecks("place",data.place);
    restoreRadio("contactedBusiness",data.contactedBusiness);
    restoreAddress(data);
    syncCategoryButtons();
    updateContactFields();
    updateParcelFields();

    const savedStep=Number(data.currentStep);
    showStep(savedStep>=1&&savedStep<=4?savedStep:1);

    if((savedStep||1)===1){
      const savedWizard=Number(data.wizardQuestion);
      const inferred=!valueOf("category")?1:!valueOf("subject")?2:valueOf("problem").length<10?4:!radioValue("contactedBusiness")?5:checkedValues("request").length===0?6:!valueOf("name")?7:7;
      setWizardQuestion(savedWizard>=1&&savedWizard<=7?savedWizard:inferred,false);
    }

    setSaveStatus("กู้คืนแบบร่างแล้ว ✓");
    showToast("เปิดแบบร่างล่าสุดแล้ว");
  }catch(error){
    console.error(error);
    showToast("ไม่สามารถเปิดแบบร่างได้");
  }
}
function restoreAddress(data){if(!data.province)return;if(!provinces.length){pendingAddressRestore=data;return}pendingAddressRestore=null;document.getElementById("province").value=data.province;provinceChanged(false);if(data.district){document.getElementById("district").value=data.district;districtChanged(false)}if(data.subDistrict){document.getElementById("subDistrict").value=data.subDistrict;subDistrictChanged(false)}}
function restoreChecks(name,values){if(!Array.isArray(values))return;document.querySelectorAll(`input[name="${name}"]`).forEach(i=>i.checked=values.includes(i.value))}
function restoreRadio(name,value){if(!value)return;document.querySelectorAll(`input[name="${name}"]`).forEach(i=>i.checked=i.value===value)}
function enableAutoSave(){
  // Scope autosave to the complaint form. Inputs in the agency finder and
  // follow-up tool must NOT modify existing complaint drafts.
  const form=document.getElementById("formPage");
  form.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"], input[type="date"], textarea')
    .forEach(element=>element.addEventListener("input",scheduleAutoSave));

  form.querySelectorAll('input[type="checkbox"], input[type="radio"]')
    .forEach(element=>element.addEventListener("change",()=>saveDraft()));

  form.querySelectorAll("select").forEach(element=>{
    if(!["province","district","subDistrict"].includes(element.id)){
      element.addEventListener("change",()=>{updateParcelFields();saveDraft()});
    }
  });
}
function updateContinueButton(){const b=document.getElementById("continueButton");if(!b)return;let hasDraft=false;try{hasDraft=Boolean(localStorage.getItem(STORAGE_KEY))}catch(error){console.warn("Cannot read saved draft",error)}b.textContent="เปิดแบบร่างล่าสุด";b.classList.toggle("hidden",!hasDraft);b.disabled=!hasDraft}
function clearEverything(){if(!confirm("ต้องการล้างข้อมูลแบบร่างทั้งหมดใช่หรือไม่?"))return;clearTimeout(autoSaveTimer);localStorage.removeItem(STORAGE_KEY);location.reload()}

function getShareUrl(){
  return "https://si-suan-png.github.io/complaint-helper/";
}
function shareToLine(){
  trackEvent("share_line");
  const url=encodeURIComponent(getShareUrl());
  window.open(`https://social-plugins.line.me/lineit/share?url=${url}`,"_blank","noopener");
}
function shareToFacebook(){
  trackEvent("share_facebook");
  const url=encodeURIComponent(getShareUrl());
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`,"_blank","noopener");
}
async function copySiteLink(){
  trackEvent("share_copy_link");
  await copyText(getShareUrl(),"คัดลอกลิงก์เว็บไซต์แล้ว");
}


/* Version 24 home tools. Input values are not persisted or sent to analytics. */
function showHomeTool(toolId){
  const workspace=document.getElementById("toolWorkspace");
  const agency=document.getElementById("agencyTool");
  const followup=document.getElementById("followupTool");
  workspace.classList.remove("hidden");
  agency.classList.toggle("hidden",toolId!=="agencyTool");
  followup.classList.toggle("hidden",toolId!=="followupTool");
  requestAnimationFrame(()=>workspace.scrollIntoView({behavior:"smooth",block:"start"}));
}
function openAgencyFinder(){trackEvent("open_agency_finder");showHomeTool("agencyTool")}
function openFollowupTool(){trackEvent("open_followup_tool");showHomeTool("followupTool")}
function closeHomeTool(){
  document.getElementById("toolWorkspace").classList.add("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}
const FINDER_PATHS={
  online:{title:"ปัญหาซื้อขายออนไลน์",steps:["รวบรวมหลักฐานการสั่งซื้อ ชำระเงิน และการติดต่อร้าน","ติดต่อผู้ขายหรือแพลตฟอร์มเพื่อขอแก้ไขหากทำได้","ตรวจสอบช่องทาง 1212 ETDA และ สคบ. ว่าเหมาะกับข้อพิพาทของคุณหรือไม่"],primary:"etda",alternates:["ocpb"],wizard:"refund"},
  consumer:{title:"ปัญหาสินค้าหรือบริการทั่วไป",steps:["เก็บใบเสร็จ สัญญา และภาพความเสียหาย","แจ้งผู้ประกอบการพร้อมหลักฐาน","หากไม่ได้รับการแก้ไข ตรวจสอบช่องทางร้องทุกข์ผู้บริโภค"],primary:"ocpb",alternates:[],wizard:"service"},
  post:{title:"พัสดุไปรษณีย์ไทย/EMS เสียหาย",steps:["ถ่ายภาพกล่อง ใบปะหน้า และสินค้าที่เสียหาย เก็บบรรจุภัณฑ์","แจ้งเหตุและสอบถามเงื่อนไขชดเชยกับไปรษณีย์ไทยโดยเร็ว","เก็บเลขเคส ผลตอบกลับ และพิจารณาร้องทุกข์เพิ่มเติมหากแก้ไม่ได้"],primary:"thpost",alternates:["ocpb"],wizard:"parcel"},
  otherParcel:{title:"พัสดุขนส่งเอกชนเสียหาย",steps:["เก็บรูปกล่อง เลขพัสดุ และหลักฐานมูลค่า","แจ้งบริษัทขนส่งผ่านช่องทางทางการและขอเลขเคส","หากยังแก้ไม่ได้ พิจารณาปรึกษาช่องทางร้องทุกข์ผู้บริโภคตามประเภทข้อพิพาท"],primary:"ocpb",alternates:[],wizard:"parcel",startFirst:true},
  telecom:{title:"ปัญหาโทรศัพท์หรืออินเทอร์เน็ต",steps:["รวบรวมหมายเลขบริการ ใบแจ้งค่าบริการ และหลักฐานปัญหา","แจ้งผู้ให้บริการและเก็บเลขรับเรื่อง","ตรวจสอบช่องทางคุ้มครองผู้ใช้บริการโทรคมนาคมของ กสทช."],primary:"nbtc",alternates:[],wizard:null},
  insurance:{title:"ข้อพิพาทเกี่ยวกับประกันภัย",steps:["เตรียมกรมธรรม์ ใบเคลมและเหตุผลปฏิเสธ (ถ้ามี)","ขอคำชี้แจงจากบริษัทประกันและเก็บหลักฐาน","ตรวจสอบช่องทางร้องเรียน คปภ. และเงื่อนไขเฉพาะกรณี"],primary:"oic",alternates:[],wizard:null},
  finance:{title:"ปัญหาธนาคารหรือการเงิน",steps:["เก็บรายละเอียดรายการที่มีปัญหาและหลักฐานที่เกี่ยวข้อง","ร้องเรียนต่อผู้ให้บริการทางการเงินก่อน หากเหมาะสม","ตรวจสอบว่าข้อพิพาทอยู่ในขอบเขตศูนย์ช่วยเหลือของ ธปท. หรือไม่"],primary:"bot",alternates:[],wizard:null},
  government:{title:"ปัญหากับบริการหรือหน่วยงานของรัฐ",steps:["ระบุหน่วยงาน วันที่เกิดเหตุ และหลักฐานที่มี","สอบถามช่องทางแก้ปัญหาของหน่วยงานต้นเรื่อง","ตรวจสอบการร้องทุกข์ผ่านศูนย์ 1111 หรือช่องทางเฉพาะเรื่อง"],primary:"gov1111",alternates:[],wizard:null},
  fraud:{title:"สงสัยถูกมิจฉาชีพหลอกโอนเงิน",urgent:true,steps:["ติดต่อธนาคารที่เกี่ยวข้องทันทีเพื่อขอความช่วยเหลือเรื่องธุรกรรม","โทรศูนย์ AOC 1441 โดยไม่ต้องรอกรอกแบบฟอร์ม","เก็บหลักฐานการโอนเงิน การสนทนา และดำเนินการแจ้งความตามช่องทางตำรวจ"],primary:"police",alternates:[],wizard:null},
  labor:{title:"นายจ้างค้างค่าจ้าง/ข้อพิพาทแรงงาน",steps:["เก็บสัญญาจ้าง สลิปเงินเดือน หลักฐานการทำงาน และข้อความทวงถาม","ตรวจสอบประเภทการจ้างและสิทธิที่เกี่ยวข้องก่อนคำนวณยอด","ติดต่อกรมสวัสดิการและคุ้มครองแรงงานหรือสำนักงานสวัสดิการและคุ้มครองแรงงานจังหวัดเพื่อสอบถามช่องทางยื่นคำร้อง"],primary:null,alternates:[],wizard:null},
  housing:{title:"เงินมัดจำหอพัก/ปัญหาสัญญาเช่า",steps:["เก็บสัญญา หลักฐานจ่ายเงิน ภาพสภาพห้องก่อน-หลัง","ขอเหตุผลการหักเงินและแจ้งคำขอคืนเงินเป็นลายลักษณ์อักษร","ตรวจสอบกฎหมายที่ใช้กับผู้ให้เช่าแต่ละประเภท และพิจารณาขอคำแนะนำจาก สคบ. เมื่อเกี่ยวข้อง"],primary:"ocpb",alternates:[],wizard:null},
  other:{title:"ยังไม่แน่ใจว่าควรไปที่ไหน",steps:["เขียนสรุปเหตุการณ์ให้ชัดว่าเกิดกับใคร ที่ไหน เมื่อใด","เก็บเอกสารและหลักฐานที่เกี่ยวข้อง","ลองสอบถามศูนย์ 1111 สำหรับเรื่องร้องทุกข์ภาครัฐ หรือหาหน่วยงานเฉพาะทางก่อนยื่น"],primary:null,alternates:[],wizard:null}
};
function renderAgencyFinder(){
  const issue=document.getElementById("agencyIssue").value;
  const box=document.getElementById("agencyFinderResult");
  const item=FINDER_PATHS[issue];
  if(!item){box.innerHTML='<p class="tool-empty">เลือกปัญหาด้านบน เพื่อดูทางเริ่มต้นที่เหมาะสม</p>';return}
  trackEvent("agency_result_view");
  let html=`<h3>${escapeHTML(item.title)}</h3>`;
  if(item.urgent)html+='<div class="tool-urgent"><strong>⚠️ กรณีเร่งด่วน</strong><br>ติดต่อธนาคารและโทร <a href="tel:1441">AOC 1441</a> ทันที อย่ารอสร้างคำร้องบนเว็บไซต์นี้</div>';
  html+='<ol class="tool-steps">'+item.steps.map(t=>`<li>${escapeHTML(t)}</li>`).join('')+'</ol>';
  if(item.primary){
    const a=AGENCIES[item.primary];
    const label=item.startFirst?"ช่องทางพิจารณาหากติดต่อบริษัทแล้วไม่ได้รับการแก้ไข":"เว็บไซต์ทางการที่อาจเกี่ยวข้อง";
    html+=`<div class="finder-agency"><span>${label}</span><strong>${escapeHTML(a.name)}</strong><p>${escapeHTML(a.reason)}</p><button type="button" class="tool-primary-btn" onclick="openAgency('${item.primary}')">เปิดเว็บไซต์ทางการ →</button></div>`;
  }
  item.alternates.forEach(key=>{
    const a=AGENCIES[key];
    html+=`<div class="finder-secondary"><strong>ทางเลือกเพิ่มเติม: ${escapeHTML(a.short)}</strong><button type="button" class="secondary-action-button" onclick="openAgency('${key}')">ดูช่องทาง →</button></div>`;
  });
  if(issue==="labor")html+='<p class="tool-help">ระบบคัดกรองช่องทางแรงงานแบบละเอียดกำลังพัฒนา จึงยังไม่ใส่ลิงก์ยื่นคำร้องโดยอัตโนมัติ</p>';
  if(issue==="other")html+='<p class="tool-help">เราไม่เลือกหน่วยงานให้โดยไม่มีข้อมูลเพียงพอ เพราะอาจทำให้ยื่นผิดช่องทางได้</p>';
  if(item.wizard)html+=`<button type="button" class="tool-secondary-btn" onclick="startFromProblem('${item.wizard}')">เตรียมข้อความร้องเรียนสำหรับเรื่องนี้ →</button>`;
  box.innerHTML=html;
}
/* Official follow-up destinations: only verified tracking entry points are labeled
   “ตรวจสถานะ”. Other agency pages are for contacting the organization, not a
   direct status feed. We never attach a case number to a URL. */
const FOLLOWUP_CHANNELS={
  ocpb:{title:"สคบ. — ตรวจสถานะเรื่องร้องทุกข์",label:"เปิดหน้าตรวจสถานะ สคบ. ↗",url:"https://complaint.ocpb.go.th/tracking",type:"status",help:"นำเลขรับแจ้งหรือรหัสอ้างอิงที่ สคบ. ออกให้ ไปกรอกบนเว็บไซต์ สคบ. หากระบบขอเข้าสู่ระบบ ให้ดำเนินการในเว็บไซต์ทางการเท่านั้น"},
  etda:{title:"1212 ETDA — ติดตามเรื่องร้องเรียน",label:"เปิดหน้า 1212 ETDA เพื่อติดตาม ↗",url:"https://1212.etda.or.th/",type:"status",help:"หน้าเว็บไซต์ 1212 ETDA มีช่องติดตามเรื่องร้องเรียนด้วยรหัสเรื่องร้องเรียน ให้กรอกข้อมูลในเว็บไซต์นั้นด้วยตัวเอง"},
  oic:{title:"คปภ. — ระบบ PPMS",label:"เปิดระบบ คปภ. (PPMS) ↗",url:"https://complaintportal.oic.or.th/",type:"status",help:"ระบบ PPMS มีเมนูติดตามสถานะ อาจต้องเข้าสู่ระบบหรือยืนยันตัวตนตามขั้นตอนที่กำหนด"},
  gov1111:{title:"ศูนย์ 1111 — ติดตามเรื่องร้องเรียน",label:"เปิดเว็บไซต์ 1111 เพื่อติดตาม ↗",url:"https://www.1111.go.th/",type:"status",help:"เลือกเมนูติดตามเรื่องร้องเรียนบนเว็บไซต์ 1111 และใช้ข้อมูลอ้างอิงตามที่ศูนย์แจ้งไว้"},
  thpost:{title:"ไปรษณีย์ไทย — สอบถามความคืบหน้าเรื่องร้องเรียน",label:"เปิดช่องทางรับเรื่องไปรษณีย์ไทย ↗",url:"https://www.thailandpost.co.th/un/form/complaints/?form_id=3",type:"contact",help:"ติดตามคำร้องกับ THP Contact Center 1545 หรือที่ทำการไปรษณีย์ โดยแจ้งเลขเคสที่เคยได้รับ ปุ่มติดตามพัสดุด้านล่างใช้ดูสถานะการขนส่ง ไม่ใช่ผลพิจารณาเรื่องร้องเรียน",parcel:true},
  nbtc:{title:"กสทช. — ติดต่อสอบถามเรื่องร้องเรียน",label:"เปิดหน้าคุ้มครองผู้บริโภค กสทช. ↗",url:"https://tcp.nbtc.go.th/th/Consumer-Protection.aspx",type:"contact",help:"ติดต่อสำนักงาน กสทช. ที่สายด่วน 1200 พร้อมเลขรับเรื่องเพื่อสอบถามความคืบหน้า ลิงก์นี้เป็นหน้าข้อมูล/ติดต่อ ไม่ใช่ระบบตรวจสถานะอัตโนมัติ"},
  bot:{title:"ธปท. — ช่องทางช่วยเหลือและร้องเรียน",label:"เปิดช่องทางช่วยเหลือ ธปท. ↗",url:"https://services.bot.or.th/",type:"contact",help:"ติดต่อช่องทางทางการของ ธปท. พร้อมรายละเอียดและเลขอ้างอิง (หากมี) เพื่อสอบถามความคืบหน้า ลิงก์นี้ไม่ใช่ระบบอ่านสถานะของเคสจากเว็บเรา"}
};
function followupAgencyName(){
  const value=document.getElementById('followAgency').value;
  if(value==='other')return document.getElementById('followAgencyOther').value.trim()||'หน่วยงานที่รับเรื่อง';
  return AGENCIES[value]?.name||'หน่วยงานที่เกี่ยวข้อง';
}
function updateFollowupAgencyLink(){
  const key=document.getElementById('followAgency').value;
  const channel=FOLLOWUP_CHANNELS[key];
  const other=document.getElementById('followAgencyOtherWrap');
  other.classList.toggle('hidden',key!=='other');
  const box=document.getElementById('followupOfficialLinks');
  box.classList.toggle('hidden',!key);
  const title=document.getElementById('followupChannelTitle');
  const help=document.getElementById('followupChannelHelp');
  const link=document.getElementById('followupChannelLink');
  const parcel=document.getElementById('followupParcelLink');
  const resultLink=document.getElementById('followAgencyLink');
  if(!key){
    title.textContent='';help.textContent='';link.classList.add('hidden');
    parcel.classList.add('hidden');resultLink.classList.add('hidden');return;
  }
  if(!channel){
    title.textContent='ตรวจสอบช่องทางของหน่วยงานที่รับเรื่อง';
    help.textContent='โปรดตรวจสอบเว็บไซต์หรือช่องทางติดต่อจากใบรับเรื่องหรือข้อความยืนยันที่ได้รับ และสอบถามโดยตรงกับหน่วยงานนั้น';
    link.classList.add('hidden');parcel.classList.add('hidden');resultLink.classList.add('hidden');
  }else{
    title.textContent=channel.title;
    help.textContent=channel.help;
    link.href=channel.url;
    link.textContent=channel.label;
    link.classList.remove('hidden');
    parcel.classList.toggle('hidden',!channel.parcel);
    resultLink.textContent=channel.type==='status'?`ตรวจสถานะผ่านเว็บไซต์ ${AGENCIES[key].short} →`:`ติดต่อ ${AGENCIES[key].short} ผ่านเว็บไซต์ทางการ →`;
    resultLink.classList.remove('hidden');
  }
  // Prevent a stale draft referring to a previously selected agency.
  const result=document.getElementById('followupResult');
  if(!result.classList.contains('hidden')){
    document.getElementById('followupText').textContent=createFollowupText();
  }
}
function createFollowupText(){
  const selected=document.getElementById('followAgency').value;
  const agency=followupAgencyName();
  const date=document.getElementById('followDate').value;
  const ref=document.getElementById('followCase').value.trim();
  const notes=document.getElementById('followNotes').value.trim();
  let lines=[
    'เรื่อง ขอสอบถามความคืบหน้าเรื่องร้องเรียนที่เคยยื่นไว้',
    '',
    `เรียน ${agency}`,
    '',
    'ข้าพเจ้าได้ยื่นเรื่องร้องเรียนไว้กับหน่วยงานของท่าน'
  ];
  if(date)lines.push(`เมื่อวันที่ ${formatThaiDate(date)}`);
  if(ref)lines.push(`เลขรับเรื่อง / เลขอ้างอิง: ${ref}`);
  if(notes)lines.push('',`รายละเอียดเพิ่มเติม: ${notes}`);
  lines.push('', 'จึงขอความอนุเคราะห์แจ้งสถานะปัจจุบัน ขั้นตอนถัดไป และเอกสารเพิ่มเติมที่จำเป็น (หากมี) เพื่อให้ข้าพเจ้าดำเนินการได้ถูกต้อง', '', 'ขอขอบพระคุณสำหรับความช่วยเหลือ', '[ชื่อและช่องทางติดต่อของผู้ร้อง]');
  return lines.join('\n');
}
function generateFollowup(){
  if(!document.getElementById('followAgency').value){showToast('กรุณาเลือกหน่วยงานที่เคยยื่นเรื่อง');return}
  trackEvent('followup_generate');
  document.getElementById('followupText').textContent=createFollowupText();
  document.getElementById('followupResult').classList.remove('hidden');
  updateFollowupAgencyLink();
  document.getElementById('followupResult').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function copyFollowup(){
  const text=document.getElementById('followupText').textContent;
  if(!text)return;
  trackEvent('followup_copy');
  copyText(text,'คัดลอกข้อความติดตามเรื่องแล้ว');
}
function openFollowupAgency(){
  const key=document.getElementById('followAgency').value;
  const channel=FOLLOWUP_CHANNELS[key];
  if(!channel)return;
  trackEvent('followup_official_link_open');
  window.open(channel.url,'_blank','noopener,noreferrer');
}

async function initializeApp(){
  initializeAnalytics();
  createUploadFields();
  enableAutoSave();
  updateContinueButton();
  updateFollowupAgencyLink();
  syncCategoryButtons();
  updateContactFields();
  updateParcelFields();
  setWizardQuestion(1,false,false);
  await loadThaiAddressData();
  if(pendingAddressRestore)restoreAddress(pendingAddressRestore);
}
initializeApp();
