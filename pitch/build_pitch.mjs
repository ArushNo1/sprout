import pptxgen from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import JSZip from "jszip";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "Sprout-MHacks-3-Minute-Pitch.pptx");
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Sprout";
pptx.subject = "MHacks 2026 three-minute pitch";
pptx.title = "Sprout remembers what you know";
pptx.company = "Sprout";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: "Instrument Serif",
  bodyFontFace: "Avenir Next",
  lang: "en-US"
};
const C = { cream:"F6EFE3", white:"FFFDFC", green:"0B6122", deep:"083E17", mid:"4E8A5E", pale:"DDEBD7", tan:"DCCBB2", ink:"20241F", coral:"B96558", gold:"E5B75A" };
const leafPath = path.join(here, "..", "web", "public", "leaf.png");
const serif = "Instrument Serif", sans = "Avenir Next";

function addTitle(slide, title, subtitle) {
  slide.addText(title, { x:0.72, y:0.45, w:11.8, h:0.72, fontFace:serif, fontSize:34, color:C.deep, margin:0, breakLine:false, fit:"shrink" });
  if (subtitle) slide.addText(subtitle, { x:0.75, y:1.18, w:11.4, h:0.36, fontFace:sans, fontSize:14, color:C.mid, margin:0, fit:"shrink" });
}
function rounded(slide,x,y,w,h,fill=C.white,line=C.pale,r=0.12) {
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h,rectRadius:r,fill:{color:fill,transparency:0},line:{color:line,width:1}});
}
function text(slide, str, x,y,w,h, size=18, color=C.ink, opts={}) {
  slide.addText(str,{x,y,w,h,fontFace:opts.serif?serif:sans,fontSize:size,color,bold:!!opts.bold,italic:!!opts.italic,margin:opts.margin??0,align:opts.align??"left",valign:opts.valign??"mid",fit:"shrink",breakLine:false,bullet:opts.bullet});
}
function pill(slide,label,x,y,w,fill=C.pale,color=C.green) {
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h:0.34,rectRadius:0.16,fill:{color:fill},line:{color:fill}});
  text(slide,label,x+0.08,y+0.03,w-0.16,0.27,10,color,{bold:true,align:"center"});
}
function arrow(slide,x1,y1,x2,y2,color=C.mid,width=2) {
  slide.addShape(pptx.ShapeType.line,{x:x1,y:y1,w:x2-x1,h:y2-y1,line:{color,width,beginArrowType:"none",endArrowType:"triangle"}});
}
function node(slide,label,x,y,w=1.65,h=0.62,fill=C.white) {
  rounded(slide,x,y,w,h,fill,C.mid);
  text(slide,label,x+0.08,y+0.05,w-0.16,h-0.1,13,C.deep,{bold:true,align:"center"});
}
function notes(slide, lines) { if (slide.addNotes) slide.addNotes(lines); }
let slideNumber = 0;
function newSlide() {
  const slide = pptx.addSlide();
  slideNumber += 1;
  slide.background = { color: C.cream };
  slide.addShape(pptx.ShapeType.line,{x:0.6,y:7.12,w:12.13,h:0,line:{color:"D8CDBE",width:1}});
  text(slide,"SPROUT · MHACKS 2026",0.64,7.16,3.1,0.2,8,"64806B",{});
  text(slide,String(slideNumber),12.25,7.13,0.4,0.2,8,"64806B",{align:"right"});
  return slide;
}

// 1 — hook
{
  const s=newSlide();
  s.addImage({path:leafPath,x:10.62,y:0.02,w:2.65,h:2.65,transparency:10,rotate:15});
  s.addImage({path:leafPath,x:0.02,y:5.45,w:1.9,h:1.9,transparency:62,rotate:195});
  text(s,"sprout",0.8,1.02,7.6,1.42,76,C.green,{serif:true});
  text(s,"remembers what you know.",0.86,2.36,8.7,0.9,42,C.deep,{serif:true,italic:true});
  text(s,"An adaptive study partner inside ASI:One",0.9,3.52,6.6,0.42,19,C.ink);
  pill(s,"Actually Intelligent",0.9,4.28,1.75,C.pale,C.deep);
  pill(s,"Fetch.ai",2.85,4.28,1.12,"DDE8F2","28577A");
  pill(s,"SpacetimeDB",4.18,4.28,1.48,"E8E1F2","604981");
  rounded(s,8.68,3.22,3.38,2.05,C.white,"C5D9C5");
  text(s,"What should I\nstudy next?",9.05,3.54,2.64,0.9,30,C.deep,{serif:true,align:"center"});
  text(s,"One clear answer, based on evidence.",9.12,4.7,2.5,0.46,14,C.mid,{align:"center"});
  notes(s,["0:00–0:22. Hook: students have more material but still choose what to study next. Name Sprout and the cross-chat memory promise."]);
}

// 2 — product loop
{
  const s=newSlide(); addTitle(s,"A syllabus becomes a learning plan.","The live demo begins after this slide.");
  rounded(s,0.75,1.78,3.0,4.78,C.white,"C5D9C5");
  pill(s,"1 · MAP",1.03,2.04,0.9,C.pale,C.green);
  text(s,"CS 201 syllabus",1.03,2.55,2.4,0.42,23,C.deep,{serif:true});
  const lines=[0.92,0.74,0.86,0.63,0.8,0.68];
  lines.forEach((q,i)=>s.addShape(pptx.ShapeType.roundRect,{x:1.03,y:3.18+i*0.36,w:2.15*q,h:0.12,rectRadius:0.06,fill:{color:i===2?C.mid:C.tan},line:{color:i===2?C.mid:C.tan}}));
  text(s,"Concepts + prerequisites",1.03,5.55,2.3,0.35,13,C.mid,{bold:true});
  arrow(s,3.88,4.0,4.55,4.0,C.mid,2.5);

  rounded(s,4.68,1.78,3.95,4.78,"F0F6ED","C5D9C5");
  pill(s,"2 · DECIDE",4.98,2.04,1.12,C.pale,C.green);
  node(s,"Arrays",5.72,2.68,1.55,0.57);
  node(s,"Hash tables",5.72,4.08,1.55,0.57,"FFF7E7");
  node(s,"Graphs",5.72,5.46,1.55,0.57);
  arrow(s,6.5,3.26,6.5,3.98,C.mid,2);
  arrow(s,6.5,4.66,6.5,5.36,C.mid,2);
  text(s,"Weakest unlocked concept",4.98,6.12,3.35,0.28,13,C.mid,{bold:true,align:"center"});
  arrow(s,8.76,4.0,9.43,4.0,C.mid,2.5);

  rounded(s,9.56,1.78,3.0,4.78,C.white,"C5D9C5");
  pill(s,"3 · ADAPT",9.86,2.04,1.05,C.pale,C.green);
  text(s,"Every answer updates",9.86,2.62,2.35,0.42,23,C.deep,{serif:true});
  const rows=[['Mastery','42% → 31%',C.coral],['Review','Tomorrow',C.green],['Format','Try a diagram',C.green]];
  rows.forEach((r,i)=>{rounded(s,9.86,3.28+i*0.72,2.36,0.55,"FAF8F4","E0DBD2");text(s,r[0],10.03,3.39+i*0.72,0.82,0.25,12,C.mid,{bold:true});text(s,r[1],10.82,3.37+i*0.72,1.18,0.28,14,r[2],{bold:true,align:"right"});});
  text(s,"State survives the chat.",9.9,5.71,2.3,0.34,14,C.deep,{bold:true,align:"center"});
  notes(s,["0:22–0:48. Explain the map, prerequisite-aware decision, and three updates after every answer. Switch to ASI:One after this slide."]);
}

// 3 — technical proof
{
  const s=newSlide(); addTitle(s,"The backend closes the learning loop.","Model-generated content sits inside deterministic learning and real-time state.");
  node(s,"ASI:One",0.78,2.05,1.55,0.68,"E4EEF7");
  node(s,"Sprout",3.05,2.05,1.55,0.68,C.pale);
  arrow(s,2.4,2.39,2.96,2.39,"28577A",2.5);
  rounded(s,5.38,1.62,3.2,3.4,"F0F6ED","BBD3B8");
  text(s,"SpacetimeDB",5.72,1.96,2.55,0.42,27,C.deep,{serif:true,align:"center"});
  const alg=[['BKT','updates mastery'],['SM-2','schedules review'],['Bandit','selects format']];
  alg.forEach((a,i)=>{rounded(s,5.76,2.62+i*0.68,2.46,0.5,C.white,"D3E2D0");text(s,a[0],5.94,2.74+i*0.68,0.72,0.22,12,C.green,{bold:true});text(s,a[1],6.64,2.72+i*0.68,1.35,0.24,12,C.ink);});
  arrow(s,4.68,2.39,5.29,2.39,C.mid,2.5);
  node(s,"Cards",9.34,1.55,1.55,0.62);
  node(s,"Garden",9.34,2.56,1.55,0.62);
  node(s,"Live games",9.34,3.57,1.55,0.62);
  [1.86,2.87,3.88].forEach(y=>arrow(s,8.69,2.39,9.25,y,C.mid,2));
  rounded(s,0.78,5.43,10.1,0.82,C.white,"D8CDBE");
  text(s,"One answer can update mastery, the review date, format evidence, and the attempt log in one transaction.",1.08,5.64,9.48,0.36,17,C.deep,{bold:true,align:"center"});
  pill(s,"Fetch.ai: agent + ACP + ASI:One + cards",0.82,6.48,3.55,"DDE8F2","28577A");
  pill(s,"SpacetimeDB: transactions + shared state + sync",4.55,6.48,4.08,"E8E1F2","604981");
  pill(s,"171 local tests passed",8.82,6.48,2.05,C.pale,C.deep);
  notes(s,["1:58–2:34. Explain BKT, SM-2, Thompson sampling and transactional updates. Mention synchronized quiz rooms only after the core loop.","Source: Fetch.ai MHacks 2026 hackpack and official MHacks track descriptions, accessed 2026-10-04."]);
}

// 4 — close
{
  const s=newSlide();
  s.addImage({path:leafPath,x:10.1,y:0.02,w:3.15,h:3.15,transparency:18,rotate:8});
  text(s,"One clear next action.",0.8,0.92,8.8,0.94,52,C.deep,{serif:true});
  text(s,"Based on what the student actually knows.",0.84,1.93,8.8,0.7,31,C.green,{serif:true,italic:true});
  const plantY=[4.95,4.55,4.1,3.62,3.08];
  plantY.forEach((y,i)=>{
    const x=1.12+i*1.34;
    s.addShape(pptx.ShapeType.line,{x:x+0.3,y:y+0.52,w:0,h:1.0,line:{color:C.green,width:5}});
    s.addShape(pptx.ShapeType.ellipse,{x:x,y,w:0.6,h:0.38,rotate:330,fill:{color:i<2?C.tan:C.mid},line:{color:i<2?C.tan:C.mid}});
    if(i>1)s.addShape(pptx.ShapeType.ellipse,{x:x+0.28,y:y+0.34,w:0.62,h:0.38,rotate:30,fill:{color:C.mid},line:{color:C.mid}});
    if(i===4)s.addShape(pptx.ShapeType.ellipse,{x:x+0.19,y:y-0.42,w:0.35,h:0.35,fill:{color:C.gold},line:{color:C.gold}});
  });
  rounded(s,8.62,3.45,3.58,2.06,C.white,"C5D9C5");
  text(s,"Try Sprout in ASI:One",8.98,3.82,2.86,0.42,26,C.deep,{serif:true,align:"center"});
  text(s,"@sprout-main-cloud",9.08,4.52,2.65,0.34,18,C.green,{bold:true,align:"center"});
  text(s,"Persistent learning. Adaptive teaching. Shared practice.",1.0,6.35,7.2,0.38,17,C.mid);
  notes(s,["2:34–3:00. Close with the exact final sentence from README.md, then stop."]);
}

// 5 — backup: algorithms
{
  const s=newSlide(); addTitle(s,"Backup · What changes after an answer?");
  const cols=[
    ["1","Mastery","Bayesian Knowledge Tracing updates P(mastered) using the concept’s learn, slip, and guess parameters."],
    ["2","Review","SM-2 updates ease and interval, with the next review capped before the exam."],
    ["3","Format evidence","Checks after a lesson update the selected format’s Beta distribution."],
    ["4","Evidence log","The attempt stores the question, result, mastery before and mastery after."]
  ];
  cols.forEach((a,i)=>{const x=0.75+(i%2)*6.1,y=1.65+Math.floor(i/2)*2.32;rounded(s,x,y,5.72,1.82,C.white,"D5E1D2");pill(s,a[0],x+0.28,y+0.28,0.38,C.green,C.white);text(s,a[1],x+0.82,y+0.25,4.45,0.4,23,C.deep,{serif:true});text(s,a[2],x+0.3,y+0.84,5.1,0.66,14,C.ink);});
  notes(s,["Backup answer for technical judges. Be precise: format evidence updates only for taught checks, practice, and review attempts that carry a format."]);
}

// 6 — backup: Spacetime
{
  const s=newSlide(); addTitle(s,"Backup · Why SpacetimeDB is core","The database owns decisions and shared interaction, not only storage.");
  const items=[
    ["Transactional learning","Reducers update mastery, scheduling, format evidence, and logs together."],
    ["Server-side decisions","The database selects the next eligible concept and teaching format."],
    ["Live multiplayer","Subscriptions synchronize rooms, timers, answers, scores, and standings."],
    ["Persistent identity","Every agent session reads the same learner and course state."]
  ];
  items.forEach((a,i)=>{const y=1.7+i*1.12;rounded(s,0.8,y,11.55,0.82,i%2?"F8F4ED":C.white,"D5E1D2");text(s,a[0],1.12,y+0.18,2.5,0.38,18,C.deep,{bold:true});text(s,a[1],3.72,y+0.18,8.2,0.38,16,C.ink);});
  text(s,"Sponsor criterion: meaningful use of real-time subscriptions, transactional updates, and server-side logic.",0.88,6.42,11.25,0.42,15,"604981",{italic:true,align:"center"});
  notes(s,["Source: official MHacks 2026 Best use of Spacetime track description, accessed 2026-10-04."]);
}

// 7 — backup: status and honesty
{
  const s=newSlide(); addTitle(s,"Backup · What is live, built, and next");
  const headers=["Live core","Built extension","Next validation"];
  const body=[
    ["Agentverse agents","ASI:One card flow","Persistent learner state","Garden pages"],
    ["Live quiz reducers","Host and player UI","Arcade modes","Offline BKT fitter"],
    ["End-to-end game run","Agent discovery","Privacy hardening","User learning study"]
  ];
  headers.forEach((h,i)=>{const x=0.75+i*4.15;rounded(s,x,1.75,3.78,4.5,i===0?"F0F6ED":i===1?"FFF8E8":"F8F4ED",i===0?"BBD3B8":i===1?"E6CE95":"D8CDBE");text(s,h,x+0.28,2.08,3.22,0.48,25,C.deep,{serif:true,align:"center"});body[i].forEach((b,j)=>{s.addShape(pptx.ShapeType.ellipse,{x:x+0.35,y:2.93+j*0.67,w:0.13,h:0.13,fill:{color:i===0?C.green:i===1?C.gold:C.coral},line:{color:i===0?C.green:i===1?C.gold:C.coral}});text(s,b,x+0.63,2.78+j*0.67,2.77,0.42,15,C.ink);});});
  notes(s,["Use this only if a judge asks what has been verified. Do not overclaim multiplayer deployment or measured learning outcomes."]);
}

await pptx.writeFile({ fileName: out });
// PptxGenJS declares one slide-master content type per slide while writing only
// the first master part. PowerPoint tolerates those orphan declarations; strict
// package validators do not. Remove declarations whose part was not written.
const zip = await JSZip.loadAsync(await fs.readFile(out));
let contentTypes = await zip.file("[Content_Types].xml").async("string");
for (let i = 2; i <= slideNumber; i += 1) {
  const part = `/ppt/slideMasters/slideMaster${i}.xml`;
  if (!zip.file(part.slice(1))) {
    contentTypes = contentTypes.replace(new RegExp(`<Override\\s+PartName=["']${part}["'][^>]*/>`), "");
  }
}
zip.file("[Content_Types].xml", contentTypes);
await fs.writeFile(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(out);
