import json,time,urllib.request,os
cat=json.load(open('catalog.json'))
for i,s in enumerate(cat):
    f=f"lyrics/{s['id']}.json"
    if os.path.exists(f): continue
    try:
        req=urllib.request.Request(f"https://studio-api.prod.suno.com/api/clip/{s['id']}",headers={"User-Agent":"Mozilla/5.0"})
        d=json.load(urllib.request.urlopen(req,timeout=20)); m=d.get('metadata') or {}
        json.dump(dict(id=s['id'],title=d.get('title'),tags=m.get('tags'),lyrics=m.get('prompt') or '',duration=m.get('duration'),instrumental=m.get('make_instrumental')),open(f,'w'))
    except Exception as e: print("fail",s['id'],e)
    time.sleep(0.25)
print("done",len(os.listdir('lyrics')))
