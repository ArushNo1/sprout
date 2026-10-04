import pptxgen from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "Sprout-MHacks-3-Minute-Pitch.pptx");
const img = (name) => path.join(here, "..", "web", "public", "showcase", name);
const leafPath = path.join(here, "..", "web", "public", "leaf.png");
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Sprout";
pptx.subject = "MHacks 2026 three-minute pitch";
pptx.title = "Sprout — multi-agent adaptive learning";
pptx.company = "Sprout";
pptx.lang = "en-US";
pptx.theme = { headFontFace: "Instrument Serif", bodyFontFace: "Avenir Next", lang: "en-US" };

const C = { cream:"F6EFE3", white:"FFFDFC", green:"0B6122", deep:"083E17", mid:"4E8A5E", pale:"DDEBD7", tan:"DCCBB2", ink:"20241F", coral:"B96558", gold:"E5B75A", blue:"DDE8F2", purple:"E8E1F2", line:"CFC2AE" };
const serif = "Instrument Serif", sans = "Avenir Next";
let slideNumber = 0;

function text(slide, value, x, y, w, h, size=18, color=C.ink, opts={}) {
  slide.addText(value, { x,y,w,h, fontFace:opts.serif?serif:sans, fontSize:size, color, bold:!!opts.bold, italic:!!opts.italic, margin:opts.margin??0, align:opts.align??"left", valign:opts.valign??"mid", fit:"shrink", breakLine:false });
}
function round(slide,x,y,w,h,fill=C.white,lineColor=C.line,r=0.12) {
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h,rectRadius:r,fill:{color:fill},line:{color:lineColor,width:1}});
}
function pill(slide,label,x,y,w,fill=C.pale,color=C.green) {
  round(slide,x,y,w,0.34,fill,fill,0.17); text(slide,label,x+0.07,y+0.02,w-0.14,0.28,10,color,{bold:true,align:"center"});
}
function arrow(slide,x1,y1,x2,y2,color=C.mid,width=2) {
  slide.addShape(pptx.ShapeType.line,{x:x1,y:y1,w:x2-x1,h:y2-y1,line:{color,width,beginArrowType:"none",endArrowType:"triangle"}});
}
function line(slide,x1,y1,x2,y2,color=C.line,width=2,dash="solid") {
  slide.addShape(pptx.ShapeType.line,{x:x1,y:y1,w:x2-x1,h:y2-y1,line:{color,width,dashType:dash}});
}
function node(slide,label,sub,x,y,w=2.0,h=0.78,fill=C.white,lineColor=C.mid) {
  round(slide,x,y,w,h,fill,lineColor); text(slide,label,x+0.1,y+0.1,w-0.2,0.27,18,C.deep,{serif:true,align:"center"});
  if(sub) text(slide,sub,x+0.1,y+0.42,w-0.2,0.21,9,C.mid,{align:"center"});
}
function footer(slide) {
  line(slide,0.6,7.12,12.73,7.12,"D8CDBE",1); text(slide,"SPROUT · MHACKS 2026",0.64,7.16,3.1,0.2,8,"64806B"); text(slide,String(slideNumber),12.25,7.13,0.4,0.2,8,"64806B",{align:"right"});
}
function newSlide() { const s=pptx.addSlide(); slideNumber+=1; s.background={color:C.cream}; footer(s); return s; }
function title(slide,heading,sub) { text(slide,heading,0.72,0.42,11.8,0.64,31,C.deep,{serif:true}); if(sub) text(slide,sub,0.75,1.06,11.5,0.32,13,C.mid); }
function notes(slide, lines) { if (slide.addNotes) slide.addNotes(lines); }
function screenshot(slide,pathName,x,y,w,h) { round(slide,x-0.04,y-0.04,w+0.08,h+0.08,C.white,"CBBEA9"); slide.addImage({path:img(pathName),x,y,w,h}); }

// 1 — preserve the user's revised title slide.
{
  const s=newSlide();
  s.addImage({path:leafPath,x:10.68,y:-0.12,w:2.78,h:2.78,transparency:8,rotate:14});
  s.addImage({path:leafPath,x:-0.12,y:5.48,w:2.12,h:2.12,transparency:62,rotate:195});
  text(s,"sprout",1.36,2.12,4.4,1.12,74,C.green,{serif:true});
  text(s,"Remembers what you know.\nGrows as you do.",1.43,3.62,5.7,1.05,29,C.deep,{serif:true,italic:true});
  text(s,"An adaptive learning partner inside ASI:One",1.45,5.02,6.9,0.42,19,C.ink);
  notes(s,["0:00–0:18 — Students have AI that can answer anything, but every chat still starts at zero. Sprout remembers what you know and grows as you do."]);
}

// 2 — five connected product surfaces.
{
  const s=newSlide(); title(s,"Five experiences. One learner model.","Sprout routes the student; every surface reads and writes the same course state.");
  round(s,5.08,2.62,3.15,1.34,C.deep,C.deep); text(s,"SPROUT",5.33,2.84,2.65,0.38,25,C.white,{serif:true,align:"center"}); text(s,"orchestrator + shared memory",5.35,3.3,2.62,0.24,10,"DDEBD7",{align:"center"});
  const items=[
    ["CURRICULUM","syllabus → concept graph",0.82,1.66,C.white],
    ["LEARN","next action across courses",0.82,4.64,"F0F6ED"],
    ["TUTOR","lesson → check → adapt",10.05,1.66,C.white],
    ["GARDEN","mastery made visible",10.05,4.64,"F0F6ED"],
    ["ARCADE","shared practice",5.54,5.66,"FFF7E7"]
  ];
  items.forEach(([a,b,x,y,f])=>node(s,a,b,x,y,2.45,0.9,f));
  arrow(s,3.35,2.1,5.02,2.96); arrow(s,3.35,5.0,5.02,3.63); arrow(s,9.98,2.1,8.3,2.96); arrow(s,9.98,5.0,8.3,3.63); arrow(s,6.77,5.61,6.68,4.03,C.gold,2.5);
  pill(s,"persistent learner state",5.17,4.43,2.98,C.pale,C.deep);
  text(s,"A result in Tutor or Arcade changes what Learn recommends and what Garden shows.",2.15,6.72,9.05,0.28,14,C.deep,{bold:true,align:"center"});
  notes(s,["0:18–0:40 — These are not five disconnected features. Curriculum structures the course. Learn chooses the next action. Tutor teaches. Garden visualizes mastery. Arcade turns practice into a shared game. All five share one learner model."]);
}

// 3 — curriculum to executable graph.
{
  const s=newSlide(); title(s,"Curriculum turns a file into an executable course graph.","The graph constrains every later decision; the model cannot skip locked prerequisites.");
  screenshot(s,"syllabus.jpg",0.74,1.55,6.92,3.89);
  node(s,"CURRICULUM","extract + validate",8.18,1.72,3.9,0.9,"F0F6ED");
  arrow(s,10.13,2.68,10.13,3.08);
  node(s,"DRAFT","student confirms structure",8.18,3.12,3.9,0.9,C.white);
  arrow(s,10.13,4.08,10.13,4.48);
  node(s,"SPACETIMEDB","graph + prerequisites",8.18,4.52,3.9,0.9,C.purple,"9B83B4");
  pill(s,"13 concepts",0.92,5.77,1.22); pill(s,"14 prerequisite links",2.31,5.77,1.9); pill(s,"cycle-checked",4.37,5.77,1.42); pill(s,"confirmed before activation",5.96,5.77,2.35);
  text(s,"Generated once. Enforced on every recommendation.",8.22,5.83,3.83,0.42,17,C.deep,{serif:true,italic:true,align:"center"});
  notes(s,["0:40–1:02 — A syllabus becomes a validated concept graph. The curriculum specialist extracts concepts and prerequisites, checks the graph, and asks for confirmation before activation. That graph now limits what Sprout can recommend."]);
}

// 4 — actual ASI:One interaction and routing proof.
{
  const s=newSlide(); title(s,"ASI:One is the front door. Sprout is the system behind it.","A live chat can invoke specialists, tools, cards, and links without losing the learner’s state.");
  round(s,0.72,1.52,5.18,4.94,"FBFAF7","BFB5A6");
  pill(s,"ASI:ONE · @sprout-main-cloud",0.98,1.78,2.45,C.blue,"28577A");
  round(s,1.03,2.38,4.25,0.67,"EFEAE2","EFEAE2"); text(s,"Make a Data Structures game for my group.",1.27,2.54,3.78,0.31,14,C.ink);
  round(s,1.52,3.28,4.03,2.17,C.white,"D2C7B7"); text(s,"Your game is ready.",1.8,3.52,3.43,0.34,21,C.deep,{serif:true});
  text(s,"Code",1.82,4.05,0.54,0.25,11,C.mid,{bold:true}); pill(s,"WVQZC4",2.38,4.0,1.12,C.pale,C.deep);
  round(s,1.8,4.62,1.48,0.46,C.deep,C.deep); text(s,"Open host",1.92,4.73,1.23,0.22,11,C.white,{bold:true,align:"center"});
  round(s,3.43,4.62,1.48,0.46,C.white,C.green); text(s,"Play as you",3.55,4.73,1.23,0.22,11,C.green,{bold:true,align:"center"});
  text(s,"Every answer grows your garden.",1.8,5.36,3.42,0.28,12,C.mid,{italic:true});
  round(s,6.62,1.65,2.25,0.84,C.deep,C.deep); text(s,"SPROUT",6.85,1.8,1.8,0.27,17,C.white,{serif:true,align:"center"}); text(s,"routes the intent",6.86,2.15,1.78,0.18,9,"DDEBD7",{align:"center"});
  node(s,"CURRICULUM","course structure",9.75,1.52,2.6,0.76,C.white); node(s,"TUTOR","questions + teaching",9.75,2.61,2.6,0.76,C.white); node(s,"ARCADE","room + results",9.75,3.70,2.6,0.76,"FFF7E7",C.gold); node(s,"GARDEN","updated mastery",9.75,4.79,2.6,0.76,"F0F6ED");
  [1.9,2.99,4.08,5.17].forEach(y=>arrow(s,8.94,2.08,9.67,y,C.mid,1.8));
  pill(s,"Agent Chat Protocol",6.65,2.78,2.15,C.blue,"28577A"); pill(s,"Agentverse discovery",6.65,3.33,2.15,C.blue,"28577A"); pill(s,"interactive cards",6.65,3.88,2.15,C.blue,"28577A");
  text(s,"The chat initiates actions; it does not own the learning logic.",6.57,6.02,5.9,0.34,15,C.deep,{bold:true,align:"center"});
  notes(s,["1:02–1:30 — Here is the actual ASI:One flow: one request creates a live game and returns host and player actions. Sprout routes the intent to the right capability. The chat starts the action, but the learning logic and persistent state live behind it."]);
}

// 5 — one answer crosses tutor, learn, and garden.
{
  const s=newSlide(); title(s,"One answer changes the entire system.","Tutor teaches; SpacetimeDB updates the model; Learn and Garden immediately see the result.");
  screenshot(s,"mastery.jpg",0.68,1.48,6.43,3.62);
  const events=[
    ["BKT","mastery","84%",C.green],
    ["SM-2","next review","1 day",C.green],
    ["BANDIT","best format","worked example",C.gold],
    ["ATTEMPT","evidence log","saved",C.mid]
  ];
  events.forEach((e,i)=>{const y=1.56+i*1.0;round(s,7.55,y,5.02,0.78,i===0?"F0F6ED":C.white,"D7CCBD");pill(s,e[0],7.78,y+0.22,0.9,i===2?"FFF2D5":C.pale,i===2?"8A6400":C.deep);text(s,e[1],8.88,y+0.2,1.57,0.3,13,C.mid,{bold:true});text(s,e[2],10.34,y+0.18,1.93,0.34,15,e[3],{bold:true,align:"right"});});
  arrow(s,10.05,5.62,4.11,5.62,C.mid,2.5);
  node(s,"LEARN","chooses the next action",0.82,5.33,2.82,0.86,"F0F6ED"); node(s,"GARDEN","renders the new state",4.42,5.33,2.82,0.86,"F0F6ED"); node(s,"TUTOR","changes the next lesson",8.02,5.33,2.82,0.86,"F0F6ED");
  text(s,"This closed loop is the product.",3.58,6.54,6.15,0.34,19,C.deep,{serif:true,italic:true,align:"center"});
  notes(s,["1:30–1:58 — After every answer, a transaction updates Bayesian mastery, the SM-2 review date, format evidence, and the attempt log. Learn chooses a different next action, Garden grows or wilts the concept, and Tutor changes the next lesson."]);
}

// 6 — two visible endpoints driven by the same state.
{
  const s=newSlide(); title(s,"Garden shows the state. Arcade makes it social.","Two different experiences; the same mastery graph underneath.");
  screenshot(s,"unlock.jpg",0.72,1.49,5.94,3.34); screenshot(s,"games.jpg",6.98,1.49,5.62,3.34);
  pill(s,"GARDEN",0.92,5.12,1.06,C.pale,C.deep); text(s,"Prerequisites unlock only when every dependency reaches the threshold.",2.15,5.08,4.35,0.42,13,C.ink);
  pill(s,"ARCADE",7.2,5.12,1.06,"FFF2D5","8A6400"); text(s,"Rooms, timers, answers, scores, and standings synchronize live.",8.43,5.08,3.95,0.42,13,C.ink);
  round(s,3.06,6.05,7.2,0.57,C.deep,C.deep); text(s,"Arcade results feed back into each player’s own garden.",3.35,6.18,6.62,0.28,14,C.white,{bold:true,align:"center"});
  notes(s,["1:58–2:24 — Garden makes the course graph visible, including locked concepts and the next eligible node. Arcade uses the same backend for synchronized rooms and scores, and the course owner’s answers feed back into personal mastery."]);
}

// 7 — explicit sponsor/technical proof and close.
{
  const s=newSlide(); title(s,"Why Sprout is more than an LLM wrapper.","The model creates language. The agent network coordinates. The backend decides and remembers.");
  const layers=[
    ["EXPERIENCE","ASI:One\nLearn · Garden · Arcade",0.72,C.blue,"28577A"],
    ["AGENT NETWORK","Sprout\nCurriculum · Tutor",3.68,"EAF2E6",C.green],
    ["DECISION ENGINE","BKT · SM-2\nBandit · prerequisite policy",6.64,C.purple,"604981"],
    ["SHARED STATE","Course graph · mastery\nReview · rooms · scores",9.60,"FFF2D5","8A6400"]
  ];
  layers.forEach((a)=>{round(s,a[2],1.76,2.57,2.55,a[3],a[4]);text(s,a[0],a[2]+0.18,2.02,2.21,0.28,11,a[4],{bold:true,align:"center"});text(s,a[1],a[2]+0.2,2.68,2.17,0.92,15,C.ink,{bold:true,align:"center"});});
  arrow(s,3.34,3.04,3.62,3.04,"28577A",2.5); arrow(s,6.30,3.04,6.58,3.04,C.green,2.5); arrow(s,9.26,3.04,9.54,3.04,"604981",2.5);
  text(s,"conversation",0.98,4.65,2.05,0.3,11,"28577A",{bold:true,align:"center"}); arrow(s,3.02,4.8,4.05,4.8,"28577A",2.5); text(s,"coordination",4.06,4.65,2.05,0.3,11,C.green,{bold:true,align:"center"}); arrow(s,6.11,4.8,7.14,4.8,C.green,2.5); text(s,"transaction",7.15,4.65,2.05,0.3,11,"604981",{bold:true,align:"center"}); arrow(s,9.2,4.8,10.23,4.8,"604981",2.5); text(s,"memory",10.25,4.65,1.63,0.3,11,"8A6400",{bold:true,align:"center"});
  pill(s,"FETCH.AI · agent runtime + ACP + ASI:One",1.05,6.14,4.15,C.blue,"28577A"); pill(s,"SPACETIMEDB · transactions + subscriptions + state",5.47,6.14,5.12,C.purple,"604981");
  text(s,"Sprout turns “What should I study?” into one evidence-based next action.",1.43,6.63,10.5,0.34,19,C.deep,{serif:true,italic:true,align:"center"});
  notes(s,["2:24–3:00 — This is why Sprout is more than a wrapper. Fetch.ai gives us discoverable agents, the Agent Chat Protocol, ASI:One, and interactive responses. SpacetimeDB owns the learner graph, runs transactional learning algorithms, and synchronizes live games. The model writes content; the backend decides what happens next and remembers why. Sprout turns “What should I study?” into one evidence-based next action."]);
}

await pptx.writeFile({ fileName: out });
console.log(out);
