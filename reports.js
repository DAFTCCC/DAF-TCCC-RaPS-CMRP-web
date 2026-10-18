(() => {
'use strict';
let fontBytes;
async function buildPdf({title,subtitle,sections,version}){
 if(!window.PDFLib||!window.fontkit)throw new Error('PDF tools are unavailable. Reload FieldReady while online.');
 const {PDFDocument,rgb}=window.PDFLib;
 const pdf=await PDFDocument.create();pdf.registerFontkit(window.fontkit);
 pdf.setTitle(title);pdf.setAuthor('FieldReady');pdf.setProducer('FieldReady '+version);
 if(!fontBytes){
  const response=await fetch('assets/vendor/report-font.ttf');
  if(!response.ok)throw new Error('PDF font is unavailable. Reload FieldReady while online.');
  fontBytes=await response.arrayBuffer();
 }
 const font=await pdf.embedFont(fontBytes,{subset:true});
 const supported=new Set(font.getCharacterSet());
 const clean=value=>Array.from(String(value??'').replace(/\t/g,'    ')).map(c=>c==='\n'||supported.has(c.codePointAt(0))?c:'?').join('');
 const width=524;let page,y;
 const newPage=()=>{
  page=pdf.addPage([612,792]);y=738;
  page.drawText('FIELDREADY · COMPETENCY STUDY',{x:44,y:761,size:9,font,color:rgb(.1,.25,.35)});
 };
 newPage();
 // Wrap by measured glyph width and split long identifiers; never truncate criteria.
 function line(value,size=9,color=rgb(.12,.15,.2)){
  for(const paragraph of clean(value).split('\n')){
   let row='';
   const draw=()=>{if(y<50)newPage();page.drawText(row,{x:44,y,size,font,color});y-=size+5;row='';};
   for(const word of paragraph.split(/\s+/)){
    if(row&&font.widthOfTextAtSize(row+' '+word,size)>width)draw();
    if(font.widthOfTextAtSize(word,size)>width){
     for(const char of word){if(font.widthOfTextAtSize(row+char,size)>width)draw();row+=char;}
    }else row+=(row?' ':'')+word;
   }
   draw();
  }
 }
 line(title,17);line(subtitle,10);
 line('Generated '+new Date().toISOString()+' · FieldReady '+version,8);
 line('Descriptive study record. In-progress assessments are provisional.');y-=8;
 for(const section of sections){
  if(y<110)newPage();
  line(section.heading,12,rgb(.05,.25,.4));
  for(const text of section.lines)line(text);
  y-=10;
 }
 const pages=pdf.getPages();
 pages.forEach((p,i)=>p.drawText(`Page ${i+1} / ${pages.length}`,{x:44,y:26,size:8,font,color:rgb(.35,.4,.45)}));
 return new Blob([await pdf.save()],{type:'application/pdf'});
}
function canShare(files){try{return !!(window.isSecureContext&&navigator.share&&navigator.canShare?.({files}));}catch{return false;}}
// Call directly from a fresh click after file preparation to preserve user activation.
function share(files,title){return navigator.share({files,title});}
window.FieldReadyReports=Object.freeze({buildPdf,canShare,share});
})();
