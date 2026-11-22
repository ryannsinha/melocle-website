#!/usr/bin/env python3
"""Loopback-only Melocle preview. Local records; no email or external services."""
import argparse
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
PERSONAS = {'founders': 'founder', 'marketing': 'team', 'sales': 'team', 'experts': 'founder', 'agencies': 'agency'}
STAGES = ('requested', 'qualified', 'invited', 'onboarding', 'activated', 'engaged', 'customer', 'closed')
WORKFLOWS = ('content', 'chorus', 'signals', 'outreach', 'unibox', 'exploring')
EVENTS = {'page_view', 'cta_click', 'form_started', 'validation_error', 'request_failed', 'workspace_view', 'workflow_selected'}
READINESS = [
 ('scope', 'Verify the early-access scope', 'Confirm availability and connected-source requirements for Content Studio, Social Chorus, signals, outreach and Unibox.'),
 ('offer', 'Confirm individual access terms', 'Request-based access. Confirm availability, setup, any pricing and the next step with each applicant.'),
 ('capture', 'Verify request handling', 'Submit a test request, review attribution, deduplication, failure recovery and deletion.'),
 ('owner', 'Assign a follow-up owner', 'Assign a real person and a response process before accepting public requests.'),
 ('proof', 'Add verified product evidence', 'Replace illustrative examples with an approved real workflow or pilot evidence when available.'),
 ('accessibility', 'Review accessible task completion', 'Check keyboard focus, text spacing, zoom and supported browsers/assistive technology.'),
 ('publishing', 'Prepare public publishing', 'Set the real domain, contact/privacy details and deployment configuration. This server stays local.'),
 ('measurement', 'Validate production measurement', 'Test accepted request → qualification → activation reporting and real-device performance.')]

def now():
    return datetime.now(timezone.utc).isoformat()

def clean(value, limit=300):
    return str(value or '').strip()[:limit]

def context(raw):
    raw = raw if isinstance(raw, dict) else {}
    result = {}
    for key in ('visitorId', 'sessionId', 'variant'):
        result[key] = clean(raw.get(key), 100)
    for key, fields in {
        'firstTouch': ('source', 'medium', 'campaign', 'term', 'content', 'referrer', 'path', 'at'),
        'lastTouch': ('source', 'medium', 'campaign', 'term', 'content', 'referrer', 'path', 'at'),
        'cta': ('placement', 'persona', 'product', 'workspace')
    }.items():
        obj = raw.get(key) if isinstance(raw.get(key), dict) else {}
        result[key] = {field: clean(obj.get(field)) for field in fields}
    return result

class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if Path(path).parent == ROOT/'.local': Path(path).parent.chmod(0o700)
        with self.connect() as db:
            db.executescript('''
              PRAGMA journal_mode=WAL;
              CREATE TABLE IF NOT EXISTS requests (
                id TEXT PRIMARY KEY, email TEXT NOT NULL, email_key TEXT UNIQUE NOT NULL,
                company TEXT NOT NULL, persona TEXT NOT NULL, team_type TEXT NOT NULL,
                workflow TEXT, status TEXT NOT NULL DEFAULT 'requested', owner TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                first_context TEXT NOT NULL, last_context TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, request_id TEXT REFERENCES requests(id) ON DELETE CASCADE);
              CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, name TEXT NOT NULL, request_id TEXT,
                visitor_id TEXT, session_id TEXT, at TEXT NOT NULL, details TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS readiness (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'unverified',
                owner TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '');
            ''')
            db.executemany('INSERT OR IGNORE INTO readiness(id) VALUES(?)', [(r[0],) for r in READINESS])
        Path(path).chmod(0o600)
    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db: yield db
        finally: db.close()
    def event(self, db, name, ctx=None, request_id=None, details=None):
        ctx = ctx or {}
        db.execute('INSERT INTO events VALUES(?,?,?,?,?,?,?)',
                   (str(uuid.uuid4()), name, request_id, ctx.get('visitorId', ''), ctx.get('sessionId', ''), now(), json.dumps(details or {})))
    def public(self, row):
        return {key: row[key] for key in ('id','email','company','persona','team_type','workflow','status','created_at','updated_at')}
    def submit(self, data):
        email = str(data.get('email') or '').strip()
        if len(email)>254: raise ValueError('Use an email address shorter than 255 characters.')
        persona = clean(data.get('persona'), 30)
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            raise ValueError('Enter a valid email address.')
        if persona not in PERSONAS:
            raise ValueError('Choose your role.')
        ctx = context(data.get('context'))
        company = clean(data.get('company'), 120)
        timestamp, token = now(), secrets.token_urlsafe(32)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM requests WHERE email_key=?', (email.casefold(),)).fetchone()
            created = row is None
            request_id = str(uuid.uuid4()) if created else row['id']
            if created:
                db.execute('INSERT INTO requests(id,email,email_key,company,persona,team_type,created_at,updated_at,first_context,last_context) VALUES(?,?,?,?,?,?,?,?,?,?)',
                           (request_id,email,email.casefold(),company,persona,PERSONAS[persona],timestamp,timestamp,json.dumps(ctx),json.dumps(ctx)))
            else:
                db.execute('UPDATE requests SET email=?,company=?,persona=?,team_type=?,updated_at=?,last_context=? WHERE id=?',
                           (email,company,persona,PERSONAS[persona],timestamp,json.dumps(ctx),request_id))
            db.execute('INSERT INTO tokens VALUES(?,?)', (hashlib.sha256(token.encode()).hexdigest(),request_id))
            self.event(db, 'request_created' if created else 'request_updated', ctx, request_id, {'persona':persona,'cta':ctx['cta']})
            row = db.execute('SELECT * FROM requests WHERE id=?', (request_id,)).fetchone()
        return {'request':self.public(row),'token':token,'created':created,'localOnly':True}
    def authorized(self, db, request_id, token):
        hashed = hashlib.sha256(token.encode()).hexdigest()
        row = db.execute('SELECT hash FROM tokens WHERE request_id=? AND hash=?', (request_id, hashed)).fetchone()
        return bool(row and hmac.compare_digest(row['hash'], hashed))

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, store, **kwargs):
        self.store = store
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, fmt, *args):
        # Never log addresses, request bodies, tokens or attribution parameters.
        pass
    def local(self, mutation=False):
        host = self.headers.get('Host', '')
        if urlsplit('http://' + host).hostname not in ('127.0.0.1','localhost','::1'):
            self.reply(403, {'error':'This preview only accepts loopback hosts.'}); return False
        origin = self.headers.get('Origin')
        if mutation and (origin and origin != 'http://' + host):
            self.reply(403, {'error':'Use the local preview to make this change.'}); return False
        if mutation and self.headers.get('X-Melocle-Preview') != '1':
            self.reply(403, {'error':'A local preview request is required.'}); return False
        return True
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        super().end_headers()
    def reply(self, code, body):
        encoded = json.dumps(body).encode()
        self.send_response(code); self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(encoded))); self.end_headers(); self.wfile.write(encoded)
    def read_json(self):
        length = int(self.headers.get('Content-Length','0'))
        if not 0 < length <= 65536 or self.headers.get_content_type() != 'application/json':
            raise ValueError('Send a JSON request smaller than 64 KB.')
        data = json.loads(self.rfile.read(length))
        if not isinstance(data,dict): raise ValueError('Send a JSON object.')
        return data
    def do_GET(self):
        if not self.local(): return
        path = urlsplit(self.path).path
        if path == '/local/review':
            self.path = '/local-review.html'; return super().do_GET()
        if path == '/api/local/review':
            with self.store.connect() as db:
                milestones = {}
                for event in db.execute("SELECT request_id,at,details FROM events WHERE name='status_changed' ORDER BY at"):
                    stage = json.loads(event['details']).get('to')
                    if stage in STAGES:
                        milestones.setdefault(event['request_id'],{}).setdefault(stage,event['at'])
                records = []
                for row in db.execute('SELECT * FROM requests ORDER BY updated_at DESC'):
                    item = dict(row); item.pop('email_key',None)
                    for key in ('first_context','last_context'): item[key] = json.loads(item[key])
                    item['milestones'] = {'requested':item['created_at'],**milestones.get(item['id'],{})}
                    records.append(item)
                counts = dict(db.execute('SELECT name,COUNT(*) FROM events GROUP BY name').fetchall())
                visitors = db.execute("SELECT COUNT(DISTINCT visitor_id) FROM events WHERE name='page_view' AND visitor_id!=''").fetchone()[0]
                readiness = []
                for key,title,description in READINESS:
                    state = dict(db.execute('SELECT * FROM readiness WHERE id=?',(key,)).fetchone())
                    readiness.append({**state,'title':title,'description':description})
            return self.reply(200,{'requests':records,'counts':counts,'visitors':visitors,'readiness':readiness,'stages':STAGES,'localOnly':True})
        if path.startswith('/api/request/'):
            request_id = path.rsplit('/',1)[-1]
            with self.store.connect() as db:
                if not self.store.authorized(db,request_id,self.headers.get('X-Preview-Token','')): return self.reply(404,{'error':'Local request not found.'})
                row = db.execute('SELECT * FROM requests WHERE id=?',(request_id,)).fetchone()
            if not row: return self.reply(404,{'error':'Local request not found.'})
            return self.reply(200,{'request':self.store.public(row),'localOnly':True})
        # Apply the same path normalization as static serving, including encoded paths.
        actual = Path(self.translate_path(self.path)).resolve()
        relative = actual.relative_to(ROOT) if actual.is_relative_to(ROOT) else None
        private = relative is None or any(part.startswith('.') for part in relative.parts) or actual.suffix in ('.py','.pyc','.sqlite3','.sqlite3-wal','.sqlite3-shm')
        if private:
            return self.reply(404,{'error':'Not found.'})
        super().do_GET()
    def list_directory(self, path):
        self.reply(404,{'error':'Directory listing is disabled.'})
        return None
    def do_HEAD(self):
        self.reply(405,{'error':'Use GET for this local preview.'})
    def do_POST(self):
        if not self.local(True): return
        try:
            data = self.read_json(); path = urlsplit(self.path).path
            if path == '/api/early-access':
                body = self.store.submit(data); return self.reply(201 if body['created'] else 200,body)
            if path == '/api/events':
                name = data.get('name')
                if name not in EVENTS: raise ValueError('Unknown local event.')
                ctx = context(data.get('context'))
                with self.store.connect() as db: self.store.event(db,name,ctx,details={'placement':ctx['cta']['placement'],'persona':ctx['cta']['persona']})
                return self.reply(200,{'saved':True,'localOnly':True})
            self.reply(404,{'error':'Not found.'})
        except (ValueError,TypeError,json.JSONDecodeError) as exc: self.reply(400,{'error':str(exc)})
        except sqlite3.Error: self.reply(503,{'error':'This computer could not save the request. Your form is still available; please retry.'})
    def do_PATCH(self):
        if not self.local(True): return
        try:
            data=self.read_json();path=urlsplit(self.path).path
            with self.store.connect() as db:
                if path.startswith('/api/request/'):
                    request_id=path.rsplit('/',1)[-1]
                    if not self.store.authorized(db,request_id,self.headers.get('X-Preview-Token','')): return self.reply(404,{'error':'Local request not found.'})
                    workflow=data.get('workflow')
                    if workflow not in WORKFLOWS: raise ValueError('Choose a starting workflow.')
                    db.execute('UPDATE requests SET workflow=?,updated_at=? WHERE id=?',(workflow,now(),request_id))
                    self.store.event(db,'workflow_selected',request_id=request_id,details={'workflow':workflow})
                    row=db.execute('SELECT * FROM requests WHERE id=?',(request_id,)).fetchone()
                    body={'request':self.store.public(row),'localOnly':True}
                elif path.startswith('/api/local/request/'):
                    request_id=path.rsplit('/',1)[-1]; stage=data.get('status')
                    if stage not in STAGES: raise ValueError('Choose a valid lifecycle stage.')
                    old=db.execute('SELECT * FROM requests WHERE id=?',(request_id,)).fetchone()
                    if not old: return self.reply(404,{'error':'Local request not found.'})
                    db.execute('UPDATE requests SET status=?,owner=?,notes=?,updated_at=? WHERE id=?',(stage,clean(data.get('owner'),100),clean(data.get('notes'),2000),now(),request_id))
                    if stage!=old['status']: self.store.event(db,'status_changed',request_id=request_id,details={'from':old['status'],'to':stage})
                    body={'saved':True,'localOnly':True}
                elif path.startswith('/api/local/readiness/'):
                    key=path.rsplit('/',1)[-1];status=data.get('status')
                    if key not in [r[0] for r in READINESS] or status not in ('unverified','in_progress','verified'): raise ValueError('Choose a valid readiness item and status.')
                    db.execute('UPDATE readiness SET status=?,owner=?,notes=? WHERE id=?',(status,clean(data.get('owner'),100),clean(data.get('notes'),2000),key))
                    body={'saved':True,'localOnly':True}
                else: return self.reply(404,{'error':'Not found.'})
            self.reply(200,body)
        except (ValueError,TypeError,json.JSONDecodeError) as exc: self.reply(400,{'error':str(exc)})
        except sqlite3.Error: self.reply(503,{'error':'The local update could not be saved. Please retry.'})
    def do_DELETE(self):
        if not self.local(True): return
        path=urlsplit(self.path).path
        if not path.startswith(('/api/request/','/api/local/request/')): return self.reply(404,{'error':'Not found.'})
        request_id=path.rsplit('/',1)[-1]
        with self.store.connect() as db:
            if path.startswith('/api/request/') and not self.store.authorized(db,request_id,self.headers.get('X-Preview-Token','')): return self.reply(404,{'error':'Local request not found.'})
            db.execute('DELETE FROM events WHERE request_id=?',(request_id,))
            db.execute('DELETE FROM requests WHERE id=?',(request_id,))
        self.reply(200,{'deleted':True,'localOnly':True})

def make_server(port, database):
    store=Store(database)
    return ThreadingHTTPServer(('127.0.0.1',port),partial(Handler,store=store))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4181);parser.add_argument('--db',default=str(ROOT/'.local'/'melocle.sqlite3'))
    args=parser.parse_args();server=make_server(args.port,args.db)
    print(f'Melocle local preview: http://127.0.0.1:{server.server_port}/',flush=True)
    print('Local review desk: /local/review — records stay on this computer.',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
