const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

let win;
const PORT = 8765;
let DATA_DIR;
let DB_FILE;

const DEFAULT_PRODUCTS = [
["1001","منظف أرضيات ليمون","منظفات أرضيات",14,9,30,5,""],
["1002","منظف أرضيات خزامة","منظفات أرضيات",14,9,25,5,""],
["1003","مسحوق غسيل أوتوماتيك","منظفات ملابس",45,34,18,5,""],
["1004","مسحوق غسيل عادي","منظفات ملابس",32,24,22,5,""],
["1005","جل غسيل","منظفات ملابس",48,36,14,4,""],
["1006","منعم ملابس","منظفات ملابس",25,17,20,5,""],
["1007","صابون صحون","منظفات صحون",12,8,40,8,""],
["1008","صابون صحون ليمون","منظفات صحون",12,8,35,8,""],
["1009","منظف زجاج أزرق","منظفات زجاج",15,10,17,5,""],
["1010","منظف زجاج أحمر","منظفات زجاج",15,10,12,5,""],
["1011","منظف حمام","منظفات حمام",18,12,16,4,""],
["1012","منظف تواليت","منظفات حمام",18,12,11,4,""],
["1013","معطر جو لافندر","معطرات",20,13,24,5,""],
["1014","معطر جو فريش","معطرات",20,13,21,5,""],
["1015","إسفنجة تنظيف","أدوات تنظيف",10,6,50,10,""],
["1016","مساحة أرضيات","أدوات تنظيف",60,40,9,3,""],
["1017","فرشاة أرضيات","أدوات تنظيف",25,15,13,4,""],
["1018","قفازات تنظيف","أدوات تنظيف",10,6,28,6,""]
];

function defaultState(){
  return {
    settings:{shop:"كاشير محل المنظفات",currency:"جنيه",phone:"",address:""},
    users:[
      {id:1,user:"admin",pass:"1234",role:"مدير",permissions:["sale","invoices","stock","buy","reports","backup","settings"]},
      {id:2,user:"cashier",pass:"1234",role:"كاشير",permissions:["sale"]}
    ],
    products:DEFAULT_PRODUCTS.map(x=>x.slice()),
    sales:[],purchases:[],held:[]
  };
function loadState(){
  ensureData();

  try{
    let data = JSON.parse(fs.readFileSync(DB_FILE,'utf8'));

    // إزالة الإيموجي من أسماء الأصناف القديمة
    if(Array.isArray(data.products)){
      data.products = data.products.map(p=>{
        if(typeof p[1] === "string"){
          p[1] = p[1].replace(/[\u{1F300}-\u{1FAFF}]/gu, "").trim();
        }
        return p;
      });

      saveState(data);
    }

    return data;

  }catch(e){
    const d = defaultState();
    saveState(d);
    return d;
  }
}
function saveState(d){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const tmp=DB_FILE+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(d,null,2),'utf8');
  fs.renameSync(tmp,DB_FILE);
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let body='';
    req.setEncoding('utf8');
    req.on('data',chunk=>{
      body+=chunk;
      if(body.length>20*1024*1024) req.destroy();
    });
    req.on('end',()=>resolve(body));
    req.on('error',reject);
  });
}
function sendJson(res,status,data){
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(body);
}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='GET' && req.url==='/'){
      const html=fs.readFileSync(path.join(__dirname,'index.html'));
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      return res.end(html);
    }
    if(req.method==='GET' && req.url==='/api/state') return sendJson(res,200,loadState());

    if(req.method==='PUT' && req.url==='/api/state'){
      const data=JSON.parse(await readBody(req));
      saveState(data);
      return sendJson(res,200,{ok:true});
    }

    if(req.method==='POST' && req.url==='/api/login'){
      const data=JSON.parse(await readBody(req));
      const state=loadState();
      const user=state.users.find(u=>u.user===String(data.user||'') && u.pass===String(data.pass||''));
      if(!user) return sendJson(res,401,{error:'اسم المستخدم أو كلمة السر غير صحيحة'});
      return sendJson(res,200,{user:{id:user.id,user:user.user,role:user.role,permissions:user.permissions}});
    }

    if(req.method==='GET' && req.url==='/api/backup'){
      const body=JSON.stringify(loadState(),null,2);
      res.writeHead(200,{
        'Content-Type':'application/json; charset=utf-8',
        'Content-Disposition':'attachment; filename="cashier_backup.json"'
      });
      return res.end(body);
    }

    if(req.method==='POST' && req.url==='/api/restore'){
      const data=JSON.parse(await readBody(req));
      if(!data || !data.settings || !Array.isArray(data.users) ||
         !Array.isArray(data.products) || !Array.isArray(data.sales)){
        return sendJson(res,400,{error:'ملف النسخة غير صالح'});
      }
      saveState({
        settings:data.settings,
        users:data.users,
        products:data.products,
        sales:data.sales,
        purchases:Array.isArray(data.purchases)?data.purchases:[],
        held:Array.isArray(data.held)?data.held:[]
      });
      return sendJson(res,200,{ok:true});
    }

    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
    res.end('Not Found');
  }catch(e){
    console.error(e);
    sendJson(res,500,{error:e.message||'حدث خطأ'});
  }
});

function createWindow(){
  win=new BrowserWindow({
    width:1400,height:900,minWidth:900,minHeight:650,
    webPreferences:{contextIsolation:true,nodeIntegration:false}
  });
  win.loadURL(`http://127.0.0.1:${PORT}/`);
}
app.whenReady().then(()=>{ensureData();server.listen(PORT,'127.0.0.1',createWindow);});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
app.on('before-quit',()=>{try{server.close()}catch(e){}});
