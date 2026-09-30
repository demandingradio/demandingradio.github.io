const d=JSON.parse(Deno.readTextFileSync("out/raw-dataset.json"));
const F=['ki','hb','mk','tk','ff','fa','ho','gl','bh','rb','if','cl','cg','cp','up','cm','mi','op','bo','ga'];
const X=[],Y=[],W=[];
for(const p of d.players){const s=p.seasons?.[2026]; if(!s||!p.sc26||s.gm<5)continue; if(Math.abs(s.gm-p.sc26.gm)>2)continue;
 X.push([1,...F.map(f=>s[f]/s.gm)]); Y.push(p.sc26.avg); W.push(s.gm);}
// weighted ridge
const n=X[0].length, A=Array.from({length:n},()=>Array(n).fill(0)), b=Array(n).fill(0);
X.forEach((x,i)=>{for(let j=0;j<n;j++){b[j]+=W[i]*x[j]*Y[i];for(let k=0;k<n;k++)A[j][k]+=W[i]*x[j]*x[k];}});
for(let j=1;j<n;j++)A[j][j]+=5;
// solve
const M=A.map((r,i)=>[...r,b[i]]);for(let i=0;i<n;i++){let p=i;for(let r=i+1;r<n;r++)if(Math.abs(M[r][i])>Math.abs(M[p][i]))p=r;[M[i],M[p]]=[M[p],M[i]];for(let r=0;r<n;r++)if(r!==i){const f=M[r][i]/M[i][i];for(let c=i;c<=n;c++)M[r][c]-=f*M[i][c];}}
const beta=M.map((r,i)=>r[n]/r[i]);
let se=0,st=0;const my=Y.reduce((a,b)=>a+b)/Y.length;X.forEach((x,i)=>{const yh=x.reduce((a,v,j)=>a+v*beta[j],0);se+=(Y[i]-yh)**2;st+=(Y[i]-my)**2;});
console.log('n',X.length,'R2',(1-se/st).toFixed(3),'RMSE',Math.sqrt(se/X.length).toFixed(2));
console.log(JSON.stringify(Object.fromEntries([['c',beta[0]],...F.map((f,i)=>[f,+beta[i+1].toFixed(3)])])));
Deno.writeTextFileSync('out/scproxy.json',JSON.stringify({F,beta}));
