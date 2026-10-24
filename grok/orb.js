(function(){
  var cv=document.getElementById('orb'); if(!cv) return;
  var ctx=cv.getContext('2d'), W=0,H=0,R=0,cx=0,cy=0,dpr=1, stars=[], dust=[];
  function seed(){
    stars=[];for(var i=0;i<900;i++){var a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*0.97;
      stars.push({x:Math.cos(a)*r,y:Math.sin(a)*r,s:Math.random()*1.1+0.3,p:Math.random()*6.28,f:0.6+Math.random()*1.6});}
    dust=[];for(var j=0;j<70;j++){dust.push({x:(Math.random()*2-1)*1.6,y:(Math.random()*2-1)*1.3,v:0.0004+Math.random()*0.0012,s:Math.random()*1.2+0.4,p:Math.random()*6.28});}
  }
  function size(){var b=cv.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);
    W=b.width;H=b.height;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    cx=W/2;cy=H/2;R=Math.min(W*0.42,H*0.34);}
  function frame(ts){
    var t=ts/1000; ctx.clearRect(0,0,W,H);
    var pulse=0.5+0.5*Math.sin(t*0.9);
    // outer faint dotted ring
    ctx.save();ctx.setLineDash([1,5]);ctx.strokeStyle='rgba(90,140,220,0.18)';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cx,cy,R*1.18,t*0.02,t*0.02+Math.PI*2);ctx.stroke();ctx.restore();
    // outer glow
    var g=ctx.createRadialGradient(cx,cy,R*0.9,cx,cy,R*1.35);
    g.addColorStop(0,'rgba(40,120,255,'+(0.30+0.12*pulse)+')');g.addColorStop(1,'rgba(20,60,160,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R*1.35,0,7);ctx.fill();
    // body
    var b=ctx.createRadialGradient(cx-R*0.15,cy-R*0.1,R*0.1,cx,cy,R);
    b.addColorStop(0,'#0a2350');b.addColorStop(0.7,'#071a3e');b.addColorStop(0.93,'#0d3a86');b.addColorStop(1,'#2a78ff');
    ctx.fillStyle=b;ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.fill();
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.clip();
    // stars
    for(var i=0;i<stars.length;i++){var s=stars[i];var a=0.25+0.55*(0.5+0.5*Math.sin(t*s.f+s.p));
      ctx.fillStyle='rgba(120,180,255,'+a.toFixed(3)+')';ctx.fillRect(cx+s.x*R,cy+s.y*R,s.s,s.s);}
    // streaks
    ctx.globalCompositeOperation='lighter';
    for(var k=0;k<22;k++){
      var amp=R*(0.04+0.11*((k*37)%11)/11), ph=k*1.7+t*(0.35+0.04*(k%5)), fr=1.2+((k*13)%7)/7;
      var off=(((k*29)%9)-4)*R*0.012;
      var lg=ctx.createLinearGradient(cx-R,0,cx+R,0);
      var al=0.18+0.25*(0.5+0.5*Math.sin(t*1.3+k));
      lg.addColorStop(0,'rgba(80,160,255,0)');lg.addColorStop(0.5,'rgba(150,210,255,'+al+')');lg.addColorStop(1,'rgba(80,160,255,0)');
      ctx.strokeStyle=lg;ctx.lineWidth=k%4===0?1.4:0.8;ctx.beginPath();
      for(var x=-1;x<=1.001;x+=0.02){var env=Math.cos(x*Math.PI/2);
        var y=cy+off+Math.sin(x*fr*Math.PI+ph)*amp*env;
        if(x===-1)ctx.moveTo(cx+x*R,y);else ctx.lineTo(cx+x*R,y);}
      ctx.stroke();}
    ctx.restore();
    ctx.save();ctx.globalCompositeOperation='lighter';
    // central beam through and beyond orb
    var bw=R*1.25, bh=R*(0.05+0.015*pulse);
    var bg=ctx.createRadialGradient(cx+R*0.05,cy,0,cx+R*0.05,cy,bw);
    bg.addColorStop(0,'rgba(200,235,255,0.9)');bg.addColorStop(0.15,'rgba(60,150,255,0.55)');bg.addColorStop(1,'rgba(30,90,255,0)');
    ctx.translate(cx,cy);ctx.scale(1,bh/bw);ctx.translate(-cx,-cy);ctx.fillStyle=bg;ctx.beginPath();ctx.arc(cx+R*0.05,cy,bw,0,7);ctx.fill();ctx.restore();
    // dotted beam extension
    ctx.save();ctx.globalCompositeOperation='lighter';
    for(var d=0;d<40;d++){var xx=cx+R*0.9+d*R*0.03+((t*30)%(R*0.03));var al2=0.5*(1-d/40);
      ctx.fillStyle='rgba(120,190,255,'+al2+')';ctx.fillRect(xx,cy-0.5,1.6,1.6);
      ctx.fillRect(cx-R*0.9-d*R*0.03-((t*30)%(R*0.03)),cy-0.5,1.6,1.6);}
    // rim: brightness falls off smoothly by angle (brightest upper-right)
    var cen=-0.35+Math.sin(t*0.25)*0.12, st=0.025;
    ctx.lineCap='round';
    for(var A=0;A<Math.PI*2;A+=st){
      var dlt=Math.atan2(Math.sin(A-cen),Math.cos(A-cen));
      var k2=Math.pow(Math.max(0,Math.cos(dlt*0.55)),4);
      var base=0.10+0.06*pulse;
      ctx.beginPath();ctx.arc(cx,cy,R,A,A+st+0.004);
      ctx.lineWidth=R*0.09;ctx.strokeStyle='rgba(40,120,255,'+(0.02+0.14*k2)*(0.8+0.4*pulse)+')';ctx.stroke();
      ctx.beginPath();ctx.arc(cx,cy,R,A,A+st+0.004);
      ctx.lineWidth=R*0.03;ctx.strokeStyle='rgba(90,170,255,'+(0.04+0.5*k2)+')';ctx.stroke();
      ctx.beginPath();ctx.arc(cx,cy,R,A,A+st+0.004);
      ctx.lineWidth=1.2+2*k2;ctx.strokeStyle='rgba('+Math.round(110+140*k2)+','+Math.round(180+70*k2)+',255,'+(base+0.6*k2)+')';ctx.stroke();
    }
    ctx.restore();
    // drifting dust
    for(var q=0;q<dust.length;q++){var u=dust[q];u.x+=u.v;if(u.x>1.6)u.x=-1.6;
      ctx.fillStyle='rgba(110,170,255,'+(0.2+0.3*(0.5+0.5*Math.sin(t*2+u.p)))+')';
      ctx.fillRect(cx+u.x*R,cy+u.y*R,u.s,u.s);}
    requestAnimationFrame(frame);
  }
  seed();size();window.addEventListener('resize',size);requestAnimationFrame(frame);
})();
