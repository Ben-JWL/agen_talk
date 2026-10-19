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
    if '~' in state:
        base,k=state.split('~')
        return variant(fam,size,base,int(k))
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
    if state not in ('user','done'):
        # Close the independent 60-frame hair wave at a full period.
        while len(q.frames)%60: q.frames.append(q.frames[-1])
    key=q.marks.get('contact',q.marks.get('hold',q.marks.get('apex',0)))
    a=dict(fps=12,loop=state not in ('user','done'),frames=secondary(fam,q.frames),key=key,review=review)
    if not a['loop']: a['next']=state+'_loop'
    return a

def secondary(fam,frames):
    # Secondary motion is independent of finger taps. Claude settles, Codex has a tiny
    # damped cable rebound, AGY has a 4-second wave with the tips delayed 1/2 second.
    out=[]
    for i,p in enumerate(frames):
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
    return out


# ---------------------------------------------------------------- motion variants (`<state>~N`)
# Rotation sets per looping state; the base key is variant 0. Every variant has exactly the base loop's length,
# starts and ends on the base frame-0 drawing (same pose, same secondary-motion phase), so the page can switch
# variants at any loop boundary without a pop. One big gesture per variant (one per 15-20 s), family pace kept.
VARS={'lead':{'work':3,'idle':3,'stall':1,'child':1,'done_loop':2,'user_loop':1},
      'intern':{'work':2,'idle':3,'stall':1,'child':1,'done_loop':2,'user_loop':1}}

def var_keys(size):
    return {st:[st]+['%s~%d'%(st,k) for k in range(1,n+1)] for st,n in VARS[size].items()}

def variant(fam,size,state,k):
    import arms_var
    M=AL if size=='lead' else AI
    V=arms_var.LA if size=='lead' else arms_var.IA
    A=M.A; T,D,H,X=M.T,M.D,M.H,M.X
    lead=size=='lead'
    front=1 if lead else -1
    other=2 if lead else -2
    pace={'claude':8,'codex':3,'agy':6}[fam]
    tap=2 if fam!='claude' else 3
    q=Timeline(M); add=q.add
    fill=None   # state-specific filler for the time left before the landing on frame 0
    def turn(a,b,**p):
        # head turn through the drawn in-betweens (lead has .5/1.5; intern cuts)
        seq=[a,b]
        if lead:
            st=1 if b>a else -1
            seq=[v/2 for v in range(int(a*2),int(b*2)+st,st)]
        for v in seq[1:-1]: add(2,view=v,**p)
        add(3,view=b,**p)
    if state=='work':
        base=dict(glow=1,mouth='flat' if fam=='codex' else 'smile')
        N=dict(base,armL=T,armR=D)
        def burst(n,**x):
            for t in range(n): add(tap,**dict(base,armL=T if t%2==0 else D,armR=D if t%2==0 else T,**x))
        add(tap,**N); burst(5)
        def fill(n):
            while len(q.frames)<n:
                burst(4 if fam!='codex' else 6); add(8+pace,**dict(base,armL=D,armR=D))
        if k==1:    # reading / scrolling: hands hover, eyes on the text, little nods, one scroll tap
            R=dict(base,armL=H,armR=H,eyes='down')
            add(4,**dict(base,armL=D,armR=D))
            for j in range(3):
                add(10+pace,mark='key' if j==1 else None,**R)
                add(3,**dict(R,hy=1)); add(5+pace//2,**R)
                if j==1:
                    add(2,**dict(R,armR=T)); add(3,**dict(R,armR=D,hy=1)); add(2,**dict(R,armR=T))
                if j==2:
                    add(14+pace,**dict(R,eyes='look')); q.blink(**R)
            add(4,**dict(base,armL=D,armR=D))
            burst(6)
        elif k==2:  # thinking: hand to chin, eyes up and away, slow blink, then a typing burst
            c=lambda n: V['chin%d'%n]
            hi,mid=(27,31) if lead else (23,25)
            add(4,**dict(base,armL=D,armR=D))
            add(2,**dict(base,armL=c(mid+2),armR=D))
            add(2,**dict(base,armL=c(mid),armR=D))
            P=dict(base,armL=c(hi),armR=D,hy=1)
            add(4,**P)
            add(16+pace,mark='key',**dict(P,eyes='up'))
            add(2,**dict(P,eyes='soft')); add(5 if fam=='claude' else 3,**dict(P,eyes='shut')); add(2,**dict(P,eyes='soft'))
            add(18+pace,**dict(P,eyes='look'))
            add(10+pace,**dict(P,eyes='up',hx=-1 if lead else 1))
            add(3,**dict(P,eyes='open',hy=2)); add(6,**dict(P,eyes='open'))   # "aha" nod
            add(2,**dict(base,armL=c(mid),armR=D))
            add(3,**dict(base,armL=D,armR=D,by=1,folds=M.SLUMP))
            burst(8); add(6+pace,**dict(base,armL=D,armR=D)); burst(6)
        else:       # lead only: lean back and review, fingers flex, a glance away, then back to keys
            P=dict(base,armL=X,armR=X,hy=0 if fam=='agy' else -1,eyes='look')   # agy already floats 1 px high
            add(4,**dict(base,armL=D,armR=D))
            add(3,**dict(base,armL=X,armR=X,by=1,folds=M.SLUMP))
            add(24+pace,mark='key',**P)
            for j in range(3):
                add(3,**dict(P,armL=H,armR=H)); add(4,**P)
            q.blink(**P)
            add(2,**dict(P,view=.5)); add(14+pace,**dict(P,view=.5,eyes='soft')); add(2,**dict(P,view=.5))
            add(20+pace,**P)
            add(3,**dict(base,armL=D,armR=D,by=1,folds=M.SLUMP))
            burst(10)
    elif state=='idle':
        low=36 if lead else 28
        s=[0]
        def mug(n,**p):
            # holds keep the steam cycling every 8+ exposures, like the base sip loop
            while n>0:
                m=min(n,8+pace//2)
                pose=M.mugpose(low,s[0]%4,eyes=p.get('eyes','soft'),mouth=p.get('mouth','smile'),
                               **{a:b for a,b in p.items() if a not in ('eyes','mouth')})
                add(m,**pose); n-=m; s[0]+=1
        def one(n,**p):
            add(n,**M.mugpose(low,s[0]%4,eyes=p.pop('eyes','soft'),mouth=p.pop('mouth','smile'),**p))
        mug(8+pace//2)
        def fill(n): mug(n-len(q.frames))
        if k==1:    # look around: camera, then the interns, mug in both hands
            if lead: one(2,eyes='look',view=.5)
            mug(30+pace,view=front,eyes='open'); q.marks['key']=len(q.frames)-10
            mug(4,view=front,eyes='shut')
            if lead: one(2,eyes='open',view=1.5)
            mug(28+pace,view=other,eyes='open')
            mug(4,view=other,eyes='shut'); mug(16,view=other,eyes='happy')
            if lead: one(2,view=1.5)
            mug(4,view=front)
            if lead: one(2,view=.5)
        elif k==2:  # neck and shoulder stretch, small
            mug(6,eyes='shut',hx=-1,hy=1); mug(14+pace,eyes='shut',hx=-1,hy=1)
            mug(4,eyes='shut',hy=1); mug(14+pace,eyes='shut',hx=1,hy=1); q.marks['key']=len(q.frames)-6
            mug(4,eyes='shut',hy=1); mug(4,eyes='soft')
            mug(6,by=-1,eyes='shut'); mug(10,by=-1,eyes='shut',mouth=None)           # shrug up...
            mug(3,by=1,eyes='happy',mouth='hum'); mug(16+pace,eyes='happy',mouth='hum')   # ...and drop
        else:       # phone in the free hand, mug kept in the other
            lo=hi='phone36' if lead else 'phone28'
            def ph(n,arm,**p):
                pose=M.mugpose(low,s[0]%4,eyes=p.pop('eyes','down'),mouth=p.pop('mouth','smile'),**p)
                pose['armR']=V[arm]; pose['over']=pose['over'][:1]
                add(n,**pose); s[0]+=1
            ph(2,lo,eyes='soft'); ph(3,hi)
            for j in range(5):
                ph(10+pace//2,hi,**({'mouth':'o'} if j==3 else {}))
                if j==2: q.marks['key']=len(q.frames)-4
                ph(3,hi+'b'); ph(4,hi)
                if j==1:
                    ph(1,hi,eyes='soft'); ph(2,hi,eyes='shut'); ph(1,hi,eyes='soft')
            ph(3,lo,eyes='soft')
    elif state=='stall':
        b=dict(armL=H,armR=H,mouth='flat',eyes='soft',hy=1)
        add(20+pace,**b)
        c=V['chin29' if lead else 'chin23']; c2=V['chin33' if lead else 'chin27']
        add(2,**dict(b,armL=c2))
        P=dict(b,armL=c,hx=-1 if lead else 1,hy=2)
        add(14+pace,mark='key',**P)
        for rep in range(3):     # drumming fingers, then a sigh
            for j in range(4): add(2,**dict(P,armR=T if j%2==0 else D))
            add(10+pace,**dict(P,armR=H))
            if rep==1: add(2,**dict(P,eyes='shut',armR=H)); add(4 if fam=='claude' else 2,**dict(P,eyes='shut',armR=H,by=1)); add(2,**dict(P,armR=H))
        add(16,**dict(P,eyes='look',armR=H))
        add(2,**dict(b,armL=c2))
    elif state=='child':
        cu,co,ct=A['cross_under'],A['cross_over'],A['cross_tap']
        b=dict(armL=cu,armR=co,mouth='smile')
        add(14+pace,**b)
        add(3,**dict(b,armR=ct))
        add(2,armL=D,armR=D,by=1,mouth='smile',folds=M.SLUMP)
        P=dict(armL=D,armR=D,mouth='flat',eyes='look',hx=-1 if lead else 1)
        for j in range(3):      # tapping, checking the monitor
            for t in range(4): add(2,**dict(P,armL=T if t%2==0 else D))
            add(10+pace,mark='key' if j==1 else None,**P)
        turn(0,front,armL=D,armR=D,mouth='smile',eyes='open')
        turn(front,other,armL=D,armR=D,mouth='smile',eyes='open')
        add(20+pace,view=other,armL=D,armR=D,mouth='smile')
        q.blink(view=other,armL=D,armR=D,mouth='smile')
        add(12,view=other,armL=T,armR=D,mouth='smile')
        turn(other,front,armL=D,armR=D,mouth='smile')
        turn(front,0,armL=D,armR=D,mouth='smile')
        add(2,armL=D,armR=D,by=1,mouth='smile',folds=M.SLUMP)
        add(3,**dict(b,armR=ct))
    elif state=='done_loop':
        b=dict(armL=X,armR=X,eyes='soft',mouth='smile')
        add(20+pace,**b)
        if k==1:    # lean back, hands laced behind the head
            add(3,**dict(b,by=1,eyes='shut',folds=M.SLUMP))
            add(2,**dict(b,armL=A['stretch_mid'],armR=A['stretch_mid'],folds=M.STRETCH))
            P=dict(armL=V['behind'],armR=V['behind'],mouth='smile',eyes='happy',hy=-1,folds=M.STRETCH)
            add(3,**dict(P,hy=0))
            add(30+pace,mark='key',**P)
            add(2,**dict(P,eyes='shut')); add(4 if fam=='claude' else 2,**dict(P,eyes='shut',mouth='hum')); add(2,**dict(P,eyes='soft'))
            add(36+pace,**dict(P,eyes='soft'))
            add(2,**dict(b,armL=A['stretch_mid'],armR=A['stretch_mid'],folds=M.STRETCH))
            add(3,**dict(b,by=1,eyes='happy',folds=M.SLUMP))
        else:       # small happy sway
            for j in range(3):
                add(8+pace//2,**dict(b,hx=-1,eyes='happy',mouth='hum' if j==1 else 'smile'))
                add(4,**dict(b,hy=1,eyes='happy'))
                add(8+pace//2,mark='key' if j==1 else None,**dict(b,hx=1,eyes='happy'))
                add(4,**dict(b,hy=1,eyes='happy'))
            add(12,**dict(b,eyes='happy'))
    elif state=='user_loop':
        rb=A['raise']
        b=dict(armL=X,armR=rb,view=front,mouth='smile',folds=M.PULL)
        add(24+pace,**b)
        if lead:
            l0,la=V['raise_l'],V['raise_lantic']
            waves=[(V['raise_l1'],A['raise_w2']),(V['raise_lm'],A['raise_w1']),(V['raise_l1'],rb),(l0,A['raise_wm']),(V['raise_lm'],rb)]
        else:
            from anims_lead import sheared
            mn=lambda a: arms_var.mirror_native(a,15)
            l0,la=V['raise_l'],V['raise_antic_l']
            waves=[(mn(sheared(rb,6,1)),up(rb,-1)),(l0,rb),(mn(sheared(rb,6,-1)),up(rb,-1)),(l0,rb)]
        add(3,**dict(b,armL=la,by=1,mouth='o'))
        add(4,**dict(b,armL=l0,mouth='open'))
        for rep in range(2):    # both hands, counter-phase
            for j,(l,r) in enumerate(waves): add(3,mark='key' if rep==0 and j==1 else None,**dict(b,armL=l,armR=r,mouth='open' if j%2 else 'smile'))
            add(10+pace,**dict(b,armL=l0))
            if rep==0: q.blink(**dict(b,armL=l0))
        add(3,**dict(b,armL=la))
    L=len(animation(fam,size,state)['frames'])
    n0=len(q.frames)
    first=q.frames[0]
    if n0>=L: raise ValueError('%s/%s/%s~%d is %d exposures, longer than the %d-frame base loop'%(fam,size,state,k,n0,L))
    tail=min(L-n0,8)
    if fill: fill(L-tail); del q.frames[L-tail:]
    q.frames.extend([first]*(L-len(q.frames)))   # land on the base frame-0 drawing
    key=q.marks.get('key',0)
    return dict(fps=12,loop=True,frames=secondary(fam,q.frames),key=key,review=[0,key,n0-1])
