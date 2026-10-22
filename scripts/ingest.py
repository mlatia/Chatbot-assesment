#!/usr/bin/env python3
"""Only the seven assessment URLs and /robots.txt may be requested."""
import argparse, hashlib, json, re, time, urllib.request, urllib.robotparser
from pathlib import Path
from datetime import datetime, timezone
from html.parser import HTMLParser

SOURCES = [
('clinic','ITC clinic profile','https://www.placidway.com/profile/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center'),
('adenocarcinoma','Adenocarcinoma treatment package','https://www.placidway.com/package/7903/Alternative-Adenocarcinoma-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC'),
('adrenal','Adrenal cancer treatment package','https://www.placidway.com/package/7902/Alternative-Adrenal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC'),
('anal','Anal cancer treatment package','https://www.placidway.com/package/7901/Alternative-Anal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC'),
('videos','ITC clinic videos','https://www.placidway.com/profile-videos/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center'),
('prices','ITC price list','https://www.placidway.com/price-list/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center'),
('comparison','Alternative medicine price comparison','https://www.placidway.com/search-medical-pricings/Alternative-Medicine/All/1')]
UA='PlacidWayAssessmentBot/1.0 (+seven-URL assessment knowledge base; no link following)'
ROOT=Path(__file__).resolve().parent.parent
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  raise ValueError('Redirect rejected: URL allowlist is exact')
opener=urllib.request.build_opener(NoRedirect)
last=0

def get(url):
 global last
 time.sleep(max(0,1.1-(time.monotonic()-last)))
 last=time.monotonic()
 with opener.open(urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'text/html,text/plain'}),timeout=35) as r:
  if r.status!=200: raise ValueError('HTTP '+str(r.status))
  return r.read(5_000_001).decode('utf-8','replace')

class Extractor(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.lines=[];self.capture=[];self.skip=0;self.title='';self.in_title=False;self.dt=''
 def handle_starttag(self,tag,attrs):
  if tag in ['script','style','noscript','svg','nav','footer','header','form','button','iframe']:self.skip+=1
  if tag=='title':self.in_title=True
  if self.skip:return
  if tag in ['h1','h2','h3','h4','p','li','tr','dt','dd']:self.capture.append([tag,[]])
  if tag in ['th','td']:
   for c in self.capture:
    if c[0]=='tr':c[1].append(' | ')
 def handle_endtag(self,tag):
  if tag=='title':self.in_title=False
  if tag in ['script','style','noscript','svg','nav','footer','header','form','button','iframe']:
   self.skip=max(0,self.skip-1);return
  if self.skip:return
  for i in range(len(self.capture)-1,-1,-1):
   if self.capture[i][0]==tag:
    t=re.sub(r'\s+',' ',' '.join(self.capture.pop(i)[1])).strip(' |')
    if tag=='dt':self.dt=t
    if tag=='dd' and self.dt:t=self.dt+': '+t
    if len(t)>=15 and t not in self.lines:self.lines.append(t)
    break
 def handle_data(self,data):
  if self.in_title:self.title+=data
  if not self.skip:
   for c in self.capture:c[1].append(data)
def extract(html, sid):
 e=Extractor();e.feed(html)
 lines=[l for l in e.lines if len(l)<=1500 and l not in ['Medical Center Reviews','Share this listing']]
 markers={'clinic':'ITC Immunity Therapy Center - Alternative Cancer Treatment in Tijuana, Tijuana, Mexico Profile Details','adenocarcinoma':'Related Experiences:','adrenal':'Related Experiences:','anal':'Related Experiences:','videos':'Explore : Stories, Testimonials, and Procedures','prices':'Explore : Stories, Testimonials, and Procedures','comparison':'Trusted Medical Tourism Platform Since 2007'}
 marker=markers[sid]
 end=next((i for i,l in enumerate(lines) if l.startswith(marker)),len(lines))
 primary=lines[:end]
 if sid=='clinic':
  primary=[l for l in primary if not any(x in l for x in ['No slots available','Virtual Consultation','Request a video call','Book a consultation'])]
 if sid=='prices':
  start=next((i for i,l in enumerate(primary) if l.endswith('Reviews')),len(primary))
  stop=next((i for i,l in enumerate(primary) if l.startswith('Price Range:')),len(primary))
  primary=primary[:start]+primary[stop:]
 if sid=='clinic':
  primary += [l for l in lines if l.startswith(('Location:','Speciality:','Associated Doctors:'))][:3]
 return e.title,primary

def main():
 p=argparse.ArgumentParser();p.add_argument('--offline',action='store_true');a=p.parse_args()
 (ROOT/'data/raw').mkdir(exist_ok=True,parents=True)
 robotpath=ROOT/'data/raw/robots.txt'
 robottext=robotpath.read_text() if a.offline else get('https://www.placidway.com/robots.txt')
 robotpath.write_text(robottext)
 rp=urllib.robotparser.RobotFileParser();rp.parse(robottext.splitlines())
 docs=[]; report=[]
 for sid,label,url in SOURCES:
  if not rp.can_fetch(UA,url):raise RuntimeError('robots.txt disallows '+url)
  f=ROOT/f'data/raw/{sid}.html'
  try:
   html=f.read_text() if a.offline else get(url)
   if not a.offline:f.write_text(html)
   title,lines=extract(html,sid)
   if len(' '.join(lines))<150:raise ValueError('Too little useful text; last-good data preserved')
   docs.append({'id':sid,'label':label,'url':url,'title':title,'fetchedAt':datetime.fromtimestamp(f.stat().st_mtime,timezone.utc).isoformat(),'sha256':hashlib.sha256(html.encode()).hexdigest(),'lines':lines})
   report.append({'id':sid,'url':url,'status':'ok','lines':len(lines),'characters':sum(map(len,lines))})
   print(json.dumps(report[-1]),flush=True)
  except Exception as e:
   report.append({'id':sid,'url':url,'status':'error','error':str(e)});print(json.dumps(report[-1]),flush=True)
 (ROOT/'data/crawl-report.json').write_text(json.dumps({'userAgent':UA,'minIntervalSeconds':1.1,'allowlistOnly':True,'sources':report},indent=2))
 if len(docs)!=7:raise SystemExit('Incomplete crawl: existing knowledge base was not replaced')
 out={'version':hashlib.sha256(json.dumps(docs).encode()).hexdigest()[:16],'builtAt':datetime.now(timezone.utc).isoformat(),'sources':docs}
 tmp=ROOT/'data/knowledge.tmp';tmp.write_text(json.dumps(out,indent=2,ensure_ascii=False));tmp.replace(ROOT/'data/knowledge.json')
if __name__=='__main__':main()
