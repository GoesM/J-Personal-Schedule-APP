// Immutable preference operations avoid Git conflicts when devices edit offline.
// Logical revision beats device clock skew; UUID is a deterministic concurrent tie-break.
export function createAppearanceStore({read, write, list, mkdir, uuid = () => crypto.randomUUID()}) {
  const dir='/repo/preferences';
  async function entries() {
    await mkdir(dir);
    const values=[];
    for(const name of await list(dir)) {
      if(!/^appearance-[a-zA-Z0-9-]+\.json$/.test(name)) continue;
      const op=JSON.parse(await read(dir+'/'+name));
      if(!['INTJ','ENTJ','INFJ','ENFJ','ISTJ','ESTJ','ISFJ','ESFJ'].includes(op.persona) || !Number.isSafeInteger(op.revision) || op.revision<1 || typeof op.id!=='string') throw Error('云端形象配置格式错误');
      values.push(op);
    }
    return values.sort((a,b)=>a.revision-b.revision || a.id.localeCompare(b.id));
  }
  return {
    read:async()=> (await entries()).at(-1)?.persona,
    save:async(persona)=> {
      if(!['INTJ','ENTJ','INFJ','ENFJ','ISTJ','ESTJ','ISFJ','ESFJ'].includes(persona)) throw Error('未知人物图标');
      const all=await entries();
      if(all.at(-1)?.persona===persona) return;
      const id=uuid();
      await write(`${dir}/appearance-${id}.json`,JSON.stringify({id,revision:(all.at(-1)?.revision||0)+1,persona}));
    },
  };
}
