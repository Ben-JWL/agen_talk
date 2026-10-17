"""Dashboard direction. Authored holds at 12 fps, with family-specific phrasing.

Frame repetition is the v1-compatible exposure sheet; the build deduplicates drawings.
Eyes close for two exposures, never an entire long hold. Big gestures happen once per 10–17 s.
"""
import atelier  # install the authored parts before constructing poses
import anims_lead as AL
import anims_intern as AI
from anims_lead import up

class Timeline:
    def __init__(self,M):
        self.M=M; self.frames=[]; self.marks={}
    def add(self,n,mark=None,**pose):
        if mark is not None: self.marks[mark]=len(self.frames)
        self.frames.extend([self.M.F(**pose)]*n)
    def blink(self,**pose):
        self.add(1,**dict(pose,eyes='soft'))
        self.add(2,**dict(pose,eyes='shut'))
        self.add(1,**dict(pose,eyes='soft'))

def animation(fam,size,state):
    M=AL if size=='lead' else AI
    A=M.A; T,D,H,X=M.T,M.D,M.H,M.X
    front=1 if size=='lead' else -1
    other=2 if size=='lead' else -2
    pace={'claude':8,'codex':3,'agy':6}[fam]
    q=Timeline(M)
    add=q.add
    rest=dict(armL=D,armR=D)
    relaxed=dict(armL=X,armR=X)
    smile='smile'
    if state=='work':
        base=dict(glow=1,mouth='flat' if fam=='codex' else 'smile')
        for burst in range(5):
            for tap in range(6 if fam=='codex' else 4):
                pose=dict(base,armL=T if tap%2==0 else D,armR=D if tap%2==0 else T)
                if burst==2: pose.update(eyes='down',hy=1)
                add(2 if fam!='claude' else 3,mark='a' if burst==0 and tap==0 else None,**pose)
                if fam=='codex' and tap==3:
                    add(1,**dict(pose,hy=1))
            add(8+pace+(8 if burst==3 else 0),**rest,**base)
            if burst in (1,4): q.blink(**rest,**base)
        add(12,**rest,**base)
        review=[0,3,6]
    elif state=='tool':
        b=dict(glow=1,eyes='look',mouth='flat')
        add(20+pace,**rest,**b)
        add(4,armL=D,armR=T,by=1,folds=M.SLUMP,**b)
        if size=='lead':
            add(3,armL=D,armR=A['reach1'],**b)
            add(2,armL=D,armR=A['reach2'],bx=1,hx=1,folds=M.PULL,**b)
            add(5,mark='contact',armL=D,armR=A['press'],bx=1,hx=1,folds=M.PULL,**b)
            add(2,armL=D,armR=A['reach2'],bx=1,hx=1,folds=M.PULL,**b)
            add(2 if fam=='codex' else 3,armL=D,armR=A['recoil'],hy=-1 if fam=='codex' else 0,**b)
            add(3,armL=D,armR=A['reach1'],**b)
        else:
            add(4,armL=D,armR=A['lift'],hy=-1,**b)
            add(2,armL=D,armR=up(A['strike'],-2),**b)
            add(4,mark='contact',armL=D,armR=A['strike'],**b)
            add(2,armL=D,armR=up(A['strike'],-1),**b)
        add(5,**rest,**b)
        add(32+pace,**rest,**b)
        q.blink(**rest,**b)
        add(40+pace,**rest,**b)
        review=[0,q.marks['contact'],len(q.frames)-1]
    elif state=='child':
        b=dict(armL=A['cross_under'],armR=A['cross_over'],mouth='smile')
        add(30+pace,mark='home',**b)
        if size=='lead': add(2,view=.5,eyes='look',**b)
        add(3,mark='front',view=front,eyes='look',**b)
        if size=='lead': add(2,view=1.5,eyes='look',**b)
        add(4,mark='turn',view=other,eyes='open',**b)
        add(24+pace,view=other,eyes='open',**b)
        add(3,view=other,**dict(b,armR=A['cross_tap']))
        add(18,view=other,**b)
        q.blink(view=other,**b)
        if size=='lead': add(2,view=1.5,**b)
        add(3,view=front,**b)
        if size=='lead': add(2,view=.5,**b)
        add(34+pace,**b)
        review=[q.marks[k] for k in ('home','front','turn')]
    elif state=='user':
        add(4,**rest,eyes='open',mouth='o')
        if size=='lead': add(2,**rest,view=.5,eyes='open',mouth='o')
        add(3,mark='notice',**rest,view=front,eyes='open',mouth='o')
        add(3,mark='anticipate',armL=X,armR=A['raise_antic'],view=front,by=1,mouth='smile',folds=M.SLUMP)
        add(2,mark='mid',armL=X,armR=A['raise_mid'],view=front,mouth='smile',folds=M.PULL)
        add(2,armL=X,armR=up(A['raise'],-1),view=front,mouth='smile',folds=M.PULL)
        add(2,armL=X,armR=up(A['raise'],-2),view=front,mouth='smile',folds=M.PULL)
        add(3,armL=X,armR=up(A['raise'],-1),view=front,mouth='smile',folds=M.PULL)
        add(5,mark='hold',armL=X,armR=A['raise'],view=front,mouth='smile',folds=M.PULL)
        review=[q.marks[k] for k in ('notice','anticipate','mid','hold')]
    elif state=='user_loop':
        b=dict(armL=X,armR=A['raise'],view=front,mouth='smile',folds=M.PULL)
        add(34+pace,**b)
        q.blink(**b)
        add(32,**b)
        if size=='lead':
            for name,n in [('raise_w1',3),('raise_w2',3),('raise_w1',3),('raise',3),('raise_wm',2),('raise',4)]:
                add(n,**dict(b,armR=A[name]))
        else:
            # Small wrist pivot, not a whole-arm row shear.
            for dy,n in [(-1,3),(0,4),(-1,3),(0,5)]: add(n,**dict(b,armR=up(A['raise'],dy)))
        add(36+pace,**b)
        q.blink(**b)
        add(30,**b)
        review=[0,40,80]
    elif state=='stall':
        b=dict(armL=H,armR=H,mouth='flat',eyes='soft',hy=1)
        add(36+pace,**b)
        if size=='lead': add(2,view=.5,**b)
        add(3,view=front,**b)
        if size=='lead': add(2,view=1.5,**b)
        add(22,view=other,**dict(b,eyes='look'))
        q.blink(view=other,**b)
        if size=='lead': add(2,view=1.5,**b)
        add(3,view=front,**b)
        if size=='lead': add(2,view=.5,**b)
        add(5,by=1,folds=M.SLUMP,**b)
        add(30+pace,by=1,folds=M.SLUMP,**b)
        add(6,**b)
        add(30,**b)
        review=[0,40,80]
    elif state=='idle':
        low,high=(36,16) if size=='lead' else (28,13)
        def mug(n,k,steam=None,mark=None,**p):
            pose=M.mugpose(k,steam,eyes=p.pop('eyes','soft'),mouth=p.pop('mouth','smile'),**p)
            add(n,mark=mark,**pose)
        for s in range(8): mug(8+pace//2,low,s%4,mark='rest' if s==0 else None)
        # Ease in, accelerate in the middle, ease out. One sip every 15–17 seconds.
        path=[35,34,32,29,26,23,20,18,17,16] if size=='lead' else [27,26,24,22,20,18,16,14,13]
        for j,k in enumerate(path):
            mug(2,k,None,mark='lift' if j==3 else None,eyes='shut' if j>len(path)-4 else 'soft',mouth=None if k<=high+2 else 'smile')
        mug(14+pace,high,None,mark='sip',eyes='shut',mouth=None)
        for j,k in enumerate(reversed(path[:-1])):
            mug(2,k,None,mark='lower' if j==3 else None,eyes='soft',mouth=None if k<high+4 else 'smile')
        for s in range(6): mug(8,low,s%4)
        review=[q.marks[k] for k in ('rest','lift','sip','lower')]
    elif state=='done':
        add(4,**rest,eyes='soft',mouth='smile')
        add(4,**rest,by=1,eyes='shut',folds=M.SLUMP)
        add(3,armL=A['stretch_mid'],armR=A['stretch_mid'],eyes='soft',mouth='smile',folds=M.STRETCH)
        # Intermediate extends the lower key before the full stretch.
        add(2,armL=up(A['stretch_mid'],-2),armR=up(A['stretch_mid'],-2),eyes='soft',folds=M.STRETCH)
        add(4,armL=A['stretch_top'],armR=A['stretch_top'],eyes='happy',mouth='smile',folds=M.STRETCH)
        add(5,mark='apex',armL=A['stretch_top'],armR=A['stretch_top'],eyes='happy',mouth='smile',by=-1,folds=M.STRETCH)
        add(6,armL=A['stretch_top'],armR=A['stretch_top'],eyes='happy',mouth='smile',folds=M.STRETCH)
        add(3,armL=A['stretch_mid'],armR=A['stretch_mid'],eyes='soft',mouth='smile',folds=M.STRETCH)
        add(3,**relaxed,by=1,eyes='soft',mouth='smile',folds=M.SLUMP)
        add(6,**relaxed,eyes='soft',mouth='smile')
        review=[0,8,q.marks['apex'],-1]
    elif state=='done_loop':
        b=dict(relaxed,eyes='soft',mouth='smile')
        add(44+pace,**b)
        q.blink(**b)
        add(30,**b)
        add(8,**dict(b,hy=1,eyes='happy'))
        add(6,**dict(b,eyes='happy'))
        add(48+pace,**b)
        review=[0,50,85]
    elif state=='stopped':
        b=dict(relaxed,hy=1,eyes='shut',mouth='flat',folds=M.SLUMP)
        add(44+pace,by=1,**b)
        add(24,by=2 if size=='lead' else 1,**dict(b,hy=1 if size=='lead' else 2))
        add(44+pace,by=1,**b)
        review=[0,50,90]
    # Secondary motion is independent of finger taps. Claude settles, Codex has a tiny
    # damped cable rebound, AGY has a 4-second wave with the tips delayed 1/2 second.
    if state not in ('user','done'):
        # Close the independent 60-frame hair wave at a full period.
        while len(q.frames)%60: q.frames.append(q.frames[-1])
    out=[]
    for i,p in enumerate(q.frames):
        p=dict(p)
        if fam=='agy':
            phases=[0,0,1,1,2,2,1,0,0,3,3,0]
            p['ph']=phases[(i//5)%len(phases)]
            p['tl']=phases[((i-6)//5)%len(phases)]
            p['rb']=phases[((i-3)//5)%len(phases)]
            p['bn']=p['tl']; p['fl']=min(2,p['ph'])
        elif fam=='claude':
            p['ph']=0
            p['ah']=1 if 52<=i%96<57 else 2 if 57<=i%96<60 else 0
            p['tp']=1 if 57<=i%96<62 else 0
            p['pm']=p['tp']
        else:
            p['ph']=0
            p['cb']=1 if 42<=i%90<45 else 2 if 45<=i%90<47 else 0
            p['st']=p['cb']
        out.append(p)
    key=q.marks.get('contact',q.marks.get('hold',q.marks.get('apex',0)))
    a=dict(fps=12,loop=state not in ('user','done'),frames=out,key=key,review=review)
    if not a['loop']: a['next']=state+'_loop'
    return a
