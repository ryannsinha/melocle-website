import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from server import make_server

class PreviewRequestsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.server=make_server(0,Path(cls.temp.name)/'requests.sqlite3')
        cls.origin=f'http://127.0.0.1:{cls.server.server_port}'
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.temp.cleanup()
    def request(self,path,method='GET',data=None,token=None,origin=None):
        headers={'Content-Type':'application/json','X-Melocle-Preview':'1','Origin':origin or self.origin}
        if token: headers['X-Preview-Token']=token
        req=Request(self.origin+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers=headers)
        try:
            with urlopen(req) as response:return response.status,json.load(response)
        except HTTPError as error:
            try:return error.code,json.load(error)
            finally:error.close()
    def lead(self,email='test@example.test',persona='sales',source='linkedin'):
        return {'email':email,'company':'Test fixture','persona':persona,'context':{'visitorId':'visitor-fixture','sessionId':'session-fixture','firstTouch':{'source':source},'lastTouch':{'source':source},'cta':{'placement':'use-case-sales','persona':persona}}}
    def test_durable_deduplicated_capture_and_context(self):
        status,first=self.request('/api/early-access','POST',self.lead())
        self.assertEqual(status,201)
        status,second=self.request('/api/early-access','POST',self.lead('TEST@example.test','marketing','x'))
        self.assertEqual(status,200);self.assertEqual(first['request']['id'],second['request']['id'])
        _,desk=self.request('/api/local/review');row=next(x for x in desk['requests'] if x['id']==first['request']['id'])
        self.assertEqual(row['first_context']['firstTouch']['source'],'linkedin');self.assertEqual(row['last_context']['lastTouch']['source'],'x')
        self.assertEqual(row['persona'],'marketing');self.assertEqual(row['team_type'],'team');self.assertTrue(first['localOnly'])
        self.assertEqual(self.request('/api/request/'+row['id'],token=first['token'])[0],200)
    def test_validation_and_origin(self):
        self.assertEqual(self.request('/api/early-access','POST',self.lead('bad-email'))[0],400)
        self.assertEqual(self.request('/api/early-access','POST',self.lead(persona='unknown'))[0],400)
        self.assertEqual(self.request('/api/early-access','POST',self.lead(),origin='https://outside.example')[0],403)
    def test_workflow_lifecycle_and_deletion(self):
        _,result=self.request('/api/early-access','POST',self.lead('lifecycle@example.test','agencies'))
        key=result['request']['id'];token=result['token']
        self.assertEqual(self.request('/api/request/'+key,token='wrong')[0],404)
        code,body=self.request('/api/request/'+key,'PATCH',{'workflow':'chorus'},token=token)
        self.assertEqual(code,200);self.assertEqual(body['request']['workflow'],'chorus')
        code,_=self.request('/api/local/request/'+key,'PATCH',{'status':'qualified','owner':'Test reviewer','notes':'Fixture'})
        self.assertEqual(code,200)
        _,current=self.request('/api/request/'+key,token=token);self.assertEqual(current['request']['status'],'qualified')
        for stage in ('activated','engaged','customer','closed'):
            self.assertEqual(self.request('/api/local/request/'+key,'PATCH',{'status':stage,'owner':'Test reviewer','notes':'Evidence recorded'})[0],200)
        _,desk=self.request('/api/local/review');reviewed=next(row for row in desk['requests'] if row['id']==key)
        self.assertEqual(reviewed['status'],'closed')
        self.assertTrue(all(stage in reviewed['milestones'] for stage in ('qualified','activated','engaged','customer')))
        self.assertEqual(self.request('/api/request/'+key,'DELETE',token=token)[0],200)
        self.assertEqual(self.request('/api/request/'+key,token=token)[0],404)
    def test_readiness_and_private_files(self):
        self.assertEqual(self.request('/api/local/readiness/offer','PATCH',{'status':'verified','owner':'Reviewer'})[0],200)
        self.assertEqual(self.request('/api/local/readiness/offer','PATCH',{'status':'fictional'})[0],400)
        self.assertEqual(self.request('/.local/requests.sqlite3')[0],404)
        self.assertEqual(self.request('/%2elocal/requests.sqlite%33')[0],404)
        self.assertEqual(self.request('/server%2epy')[0],404)
    def test_restart_keeps_records(self):
        _,result=self.request('/api/early-access','POST',self.lead('restart@example.test'))
        secondary=make_server(0,Path(self.temp.name)/'requests.sqlite3')
        worker=threading.Thread(target=secondary.serve_forever,daemon=True);worker.start()
        try:
            url=f'http://127.0.0.1:{secondary.server_port}/api/request/'+result['request']['id']
            with urlopen(Request(url,headers={'X-Preview-Token':result['token']})) as response:
                self.assertEqual(json.load(response)['request']['id'],result['request']['id'])
        finally:secondary.shutdown();secondary.server_close()
    def test_local_funnel_events(self):
        self.assertEqual(self.request('/api/events','POST',{'name':'page_view','context':{'visitorId':'unique-visitor','sessionId':'local-session'}})[0],200)
        self.assertEqual(self.request('/api/events','POST',{'name':'unapproved'})[0],400)
        _,desk=self.request('/api/local/review');self.assertGreaterEqual(desk['visitors'],1)

if __name__=='__main__':unittest.main()
