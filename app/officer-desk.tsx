'use client';
import { RoleSignOut } from '@/components/role-signout';
import { useState, useEffect, useCallback } from 'react';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Toaster, toast } from 'sonner';
import { Mail, Inbox, ShieldCheck, Truck, ArrowUpRight, Plus, Search, Building2, LockKeyhole, RefreshCw, FileText, ArrowRight, CheckCircle2, Clock, AlertTriangle, Bell, ChevronRight } from 'lucide-react';
import { LetterDates, ReplyStatus } from '@/components/letter-progress';
import { sriLankaDate, deliveryLabel, officeName, offices, type Person, type Letter, contents, DJANGO_GROUP_PERMISSIONS } from '@/lib/model';
const labels: Record<string, string[]> = { English: ['Correspondence', 'Physical delivery', 'Between offices', 'Activity trail', 'People & roles', '', 'Register letter', 'Awaiting decision', 'Delivery pending', 'Physically received', 'Delivery issues'], Sinhala: ['ලිපි ලේඛන', 'භෞතික බෙදාහැරීම', 'කාර්යාල අතර', 'ක්‍රියාකාරකම් ඉතිහාසය', 'පුද්ගලයන් සහ භූමිකා', '', 'ලිපිය ලියාපදිංචි කරන්න', 'තීරණයක් අපේක්ෂාවෙන්', 'බෙදාහැරෙමින් පවතී', 'භාර දෙන ලදී', 'ගැටලු'], Tamil: ['கடிதங்கள்', 'நேரடி விநியோகம்', 'அலுவலகங்களுக்கு இடையில்', 'செயற்பாட்டு வரலாறு', 'பயனர்கள் மற்றும் பொறுப்புகள்', '', 'கடிதத்தைப் பதிவு செய்க', 'முடிவுக்காகக் காத்திருக்கிறது', 'விநியோகத்தில்', 'வழங்கப்பட்டது', 'சிக்கல்கள்'] };
function Pick({ value, onChange, items, label }: any) { return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="w-full"><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{items.map((x: any) => <SelectItem key={typeof x === 'string' ? x : x.id} value={typeof x === 'string' ? x : x.id}>{typeof x === 'string' ? x : x.name}</SelectItem>)}</SelectContent></Select>; }
function Field({ label, children }: any) { return <label className="field"><span>{label}</span>{children}</label>; }
const when = (v: string) => new Date(v).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' });
const localNow = () => { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export default function OfficerDesk() {
    const [view, setView] = useState(0), [lang, setLang] = useState('English'), [people, setPeople] = useState<Person[]>([]), [letters, setLetters] = useState<Letter[]>([]), [actor, setActor] = useState<Person | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [query, setQuery] = useState(''), [filter, setFilter] = useState('All stages'), [selected, setSelected] = useState<string | null>(null), [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [op, setOp] = useState<any>(null), [opText, setOpText] = useState(''), [opPerson, setOpPerson] = useState(''), [opOffice, setOpOffice] = useState('KOT'), [opStatus, setOpStatus] = useState('In progress'), [newPerson, setNewPerson] = useState(false), [personName, setPersonName] = useState(''), [personEmail, setPersonEmail] = useState(''), [personRole, setPersonRole] = useState('Officer'), [personOffice, setPersonOffice] = useState('COL');
    const [form, setForm] = useState<any>({ subject: '', sender: '', received: localNow(), method: 'Post', condition: 'Good', language: 'English', secret: false, hod: '', department: '' }), [upload, setUpload] = useState<File | null>(null), [preview, setPreview] = useState('');
    const [opDate, setOpDate] = useState(sriLankaDate()), [replyRecipient, setReplyRecipient] = useState(''), [replyAddress, setReplyAddress] = useState('');
    const t = labels[lang];
    const l = letters.find(x => x.id === selected);
    const who = (id: string) => people.find(p => p.id === id)?.name || 'Unassigned';
    const actorId = '';
    const load = useCallback(async () => { try {
        setError('');
        const r = await fetch('/api/desk', { cache: 'no-store' });
        if (r.status === 401 || r.status === 403) {
            window.location.replace('/login');
            return;
        }
        const d: any = await r.json();
        if (!r.ok)
            throw new Error(d.error);
        if (d.actor.role !== 'Officer') {
            window.location.replace('/');
            return;
        }
        setLetters(d.letters);
        setPeople(d.people);
        setActor(d.actor);
    }
    catch (e: any) {
        setError(e.message);
    }
    finally {
        setLoading(false);
    } }, []);
    useEffect(() => { setSelected(null); setLoading(true); load(); }, [load]);
    useEffect(() => { if (!upload) {
        setPreview('');
        return;
    } const url = URL.createObjectURL(upload); setPreview(url); return () => URL.revokeObjectURL(url); }, [upload]);
    async function mutate(data: any) { setBusy(true); try {
        const r = await fetch('/api/desk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const d: any = await r.json();
        if (!r.ok)
            throw new Error(d.error);
        await load();
        return d;
    }
    catch (e: any) {
        toast.error(e.message);
        throw e;
    }
    finally {
        setBusy(false);
    } }
    async function openLetter(id: string) { try {
        await mutate({ type: 'view', id });
        setSelected(id);
    }
    catch { } }
    function action(type: string) { setOpDate(sriLankaDate()); setReplyRecipient(''); setReplyAddress(''); setOp({ type, id: l?.id }); setOpText(''); setOpPerson(''); setOpStatus('In progress'); setOpOffice(offices.find(x => x !== l?.office) || 'KOT'); }
    async function doAction(e: any) { e.preventDefault(); try {
        await mutate({ ...op, note: opText, person: opPerson, office: opOffice, status: opStatus, physicalReceivedDate: opDate, recipient: replyRecipient, address: replyAddress });
        setOp(null);
        toast.success('Saved to the activity trail');
    }
    catch { } }
    async function attach(file: File, id: string) { const data = new FormData(); data.set('file', file); data.set('id', id); const r = await fetch('/api/scan', { method: 'POST', body: data }); const d: any = await r.json(); if (!r.ok)
        throw new Error(d.error); await load(); }
    const departments = Array.from(new Set(people.filter(p => p.role === 'HOD' && p.office === actor?.office && p.active && p.subject).map(p => p.subject as string)));
    useEffect(() => { const mc = (document as any).modelContext; if (!mc?.registerTool)
        return; const ac = new AbortController(); Promise.resolve(mc.registerTool({ name: 'find_correspondence', description: 'Search correspondence visible to your signed-in role.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: any) => { if (typeof input.query !== 'string')
            throw new Error('query must be text'); setQuery(input.query); setView(0); return letters.filter(l => (l.ref + ' ' + l.subject).toLowerCase().includes(input.query.toLowerCase())).map(l => ({ reference: l.ref, subject: l.subject, delivery: l.delivery })); } }, { signal: ac.signal })).catch(() => { }); return () => ac.abort(); }, [letters]);
    const visibleLetters = letters.filter(x => (x.subject + ' ' + x.ref + ' ' + x.sender).toLowerCase().includes(query.toLowerCase()) && (filter === 'All stages' || x.delivery === filter) && (view !== 1 || x.delivery !== 'Delivered') && (view !== 2 || x.destination || x.origin || x.replyTo));
    const stats = [letters.filter(x => ['Registered', 'With HOD', 'Returned to HOD'].includes(x.delivery)).length, letters.filter(x => ['Assigned', 'Awaiting dispatch', 'In transit'].includes(x.delivery)).length, letters.filter(x => x.delivery === 'Delivered').length, letters.filter(x => x.delivery === 'Missing' || x.history.at(-1)?.text.startsWith('Physical delivery exception')).length];
    const awaiting = letters.filter(x => x.officer === actor?.id && x.action !== 'Action recorded');
    const roleDescription = 'Your assigned correspondence';
    const menuItems = [[Inbox, 0], [Truck, 1], [ArrowUpRight, 2], [ShieldCheck, 3], [Building2, 4]] as const;
    const permittedViews = [0, 3];
    return <SidebarProvider><Toaster richColors position="top-right"/><Sidebar><SidebarHeader><div className="brand"><Mail /><span>Mail<small>MANAGEMENT SYSTEM</small></span></div></SidebarHeader><SidebarContent><div className="navlabel">YOUR ROLE</div><SidebarMenu>{menuItems.filter(([, index]) => permittedViews.includes(index)).map(([Icon, index]) => <SidebarMenuItem key={index}><SidebarMenuButton isActive={view === index} onClick={() => { setView(index); setQuery(''); setFilter('All stages'); }}><Icon /><span>{t[index]}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu><div className="sidebar-note"><LockKeyhole size={18}/><b>OFFICER</b><p>{actor ? officeName[actor.office] : 'Loading office…'}</p><RoleSignOut /></div></SidebarContent></Sidebar><SidebarInset><header className="topbar"><SidebarTrigger /><span className="breadcrumb">{actor ? officeName[actor.office] : 'Workspace'} <span>/</span> {'OFFICER'}</span><div className="language"><Pick label="Interface language" value={lang} onChange={setLang} items={['English', 'Sinhala', 'Tamil']}/></div></header><main className="workspace"><div className="role-strip"><div><span className="eyebrow">SIGNED IN AS</span><strong>{actor?.name || 'Loading…'}</strong><small>{"OFFICER"} · {actor ? officeName[actor.office] : ''}</small></div><p><b>{roleDescription}</b></p><Button variant="outline" size="sm" onClick={load} disabled={busy} aria-label="Refresh register"><RefreshCw size={16}/></Button></div><div className="heading"><div><div className="eyebrow">CORRESPONDENCE DESK</div><h1>{t[view]}</h1><p>{view === 0 ? 'Review your letters and next actions.' : view === 1 ? 'Physical originals remain visible until they reach the intended person.' : view === 2 ? 'Track letters from dispatch to the receiving office.' : view === 3 ? 'A record of decisions, views and physical handovers.' : view === 4 ? 'Assign one role per person using their work email.' : 'Four roles. One connected correspondence journey.'}</p></div></div>
 {error ? <div className="error-box"><AlertTriangle /><div><b>Workspace unavailable</b><p>{error}</p>{error.startsWith('Sign in') ? <a className="signin" href="/login" target="_top">Sign in to your workspace →</a> : <Button onClick={load}>Try again</Button>}</div></div> : loading ? <div className="panel loading">Loading correspondence…</div> : <>
 {view < 3 && <><div className="stats">{stats.map((n, i) => <button key={i} onClick={() => { setView(0); setFilter(i === 0 ? 'Registered' : i === 1 ? 'Assigned' : i === 2 ? 'Delivered' : 'Missing'); }}><span>{t[7 + i]}{[Clock, Truck, CheckCircle2, AlertTriangle].map((I, j) => i === j ? <I key={j} size={18}/> : null)}</span><strong>{String(n).padStart(2, '0')}</strong><small>{i === 2 ? 'Physical receipt recorded' : i === 3 ? 'Needs a delivery check' : i === 1 ? 'Assigned or transferring' : 'Registered, with HOD or returned'}</small></button>)}</div>{awaiting.length > 0 && <div className="notice"><Bell size={18}/><span><b>{awaiting.length} {awaiting.length === 1 ? 'item needs' : 'items need'} attention</b> in this role’s queue</span><button onClick={() => openLetter(awaiting[0].id)}>Open next <ArrowRight size={15}/></button></div>}<section className="panel"><div className="panel-head"><h2>{view === 2 ? 'Office-to-office register' : view === 1 ? 'Delivery queue' : 'Incoming register'} <span className="count">{visibleLetters.length}</span></h2><div className="tools"><div className="search"><Search size={16}/><Input aria-label="Search correspondence" placeholder="Search subject or reference…" value={query} onChange={e => setQuery(e.target.value)}/></div><Pick label="Stage filter" value={filter} onChange={setFilter} items={['All stages', 'Registered', 'With HOD', 'Assigned', 'Delivered', 'Missing', 'Returned to HOD', 'Awaiting dispatch', 'In transit']}/></div></div><Table><TableHeader><TableRow><TableHead className="letter-col">Letter / reference</TableHead><TableHead>Responsible</TableHead><TableHead>Delivery</TableHead><TableHead>Action</TableHead><TableHead>Office</TableHead><TableHead /></TableRow></TableHeader><TableBody>{visibleLetters.map(x => <TableRow key={x.id} className="mail-row"><TableCell><button className="letter-button" onClick={() => openLetter(x.id)}><span className={'letter-icon ' + (x.secret ? 'secret' : '')}>{x.secret ? <LockKeyhole size={19}/> : <FileText size={19}/>}</span><span><b>{x.subject}</b><small>{x.ref} {x.secret ? ' · SECRET ENVELOPE' : ''}</small></span></button></TableCell><TableCell><span className="owner-name">{who(x.officer || x.hod)}</span><small>{x.officer ? 'Assigned officer' : 'Decision maker'}</small></TableCell><TableCell><span className={'badge ' + (x.delivery === 'Delivered' ? 'done' : x.delivery === 'Missing' ? 'warning' : '')}>{deliveryLabel(x.delivery)}</span></TableCell><TableCell><span className="action-state">{x.action}</span></TableCell><TableCell>{x.office}{x.destination && ' → ' + x.destination}</TableCell><TableCell><button aria-label={'Open ' + x.ref} onClick={() => openLetter(x.id)}><ChevronRight size={18}/></button></TableCell></TableRow>)}</TableBody></Table>{!visibleLetters.length && <div className="empty"><Inbox /><h2>No correspondence here</h2><p>Try another filter.</p></div>}<div className="table-footer">{visibleLetters.length} records · Times shown in Sri Lanka Standard Time <span>Delivery and action progress are tracked separately</span></div></section></>}
 {view === 3 && <section className="panel"><div className="panel-head"><h2>Activity across visible correspondence</h2></div><div className="audit-list">{letters.flatMap(l => l.history.map(e => ({ ...e, ref: l.ref, id: l.id }))).sort((a, b) => b.at.localeCompare(a.at)).map((e, i) => <div className="audit-event" key={i}><span className="timeline-dot"/><div><b>{e.text}</b><p>{e.actor} · {e.role} · <button onClick={() => openLetter(e.id)}>{e.ref}</button></p></div><time>{when(e.at)}</time></div>)}</div></section>}
 </>}
 </main></SidebarInset>
 <Sheet open={!!selected && !!l} onOpenChange={v => !v && setSelected(null)}><SheetContent className="detail-sheet sm:max-w-[690px] overflow-y-auto"><SheetHeader><div className="eyebrow">{l?.ref}</div><SheetTitle className="text-2xl">{l?.subject}</SheetTitle><SheetDescription>{l?.secret ? 'Restricted envelope correspondence' : 'Correspondence record'} · {l?.office && officeName[l.office]}</SheetDescription></SheetHeader>{l && actor && <div className="detail-body"><div className="detail-badges"><span className={'badge ' + (l.delivery === 'Delivered' ? 'done' : '')}>{deliveryLabel(l.delivery)}</span><span className="badge neutral">Action: {l.action}</span></div><Tabs defaultValue="details"><TabsList><TabsTrigger value="details">Details & actions</TabsTrigger><TabsTrigger value="history">History ({l.history.length})</TabsTrigger></TabsList><TabsContent value="details"><dl className="metadata">{[['From', l.sender], ['Initial receipt', when(l.received)], ['Digital registration', when(l.entered)], ['Arrival', l.method], ['Condition', l.condition], ['Language', l.language], ['Responsible HOD', who(l.hod)], ['Assigned officer', who(l.officer)], ['Views', String(l.views)], ...(l.department ? [['Department', l.department]] : []), ...(l.destination ? [['Destination', officeName[l.destination]]] : []), ...(l.previousRefs?.length ? [['Earlier references', l.previousRefs.join(', ')]] : [])].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><LetterDates letter={l}/><ReplyStatus letter={l}/>{l.instructions && <section className="instruction"><b>HOD instructions</b><p>{l.instructions}</p></section>}{l.outcome && <section className="instruction"><b>Latest action</b><p>{l.outcome}</p></section>}{contents(actor, l) ? <section className="scan-box"><FileText /><div><b>{l.secret ? 'Restricted contents' : 'Scanned correspondence'}</b>{l.file ? <a href={'/api/scan?actor=' + actorId + '&id=' + l.id} target="_blank" rel="noreferrer">Open {l.fileName} ↗</a> : <p>{l.sample && !l.secret ? 'Sample record — no original scan attached.' : 'No scan attached.'}</p>}{l.restrictedText && <p className="preserve">{l.restrictedText}</p>}</div></section> : <section className="instruction"><LockKeyhole /><p>Envelope metadata only. Contents are restricted to the addressed HOD and SUPER AUTHORITY.</p></section>}
 <div className="action-section"><h2>Available actions</h2><div className="action-buttons">{actor.id === l.officer && !l.destination && <>{!l.physicalReceivedDate && <Button variant="outline" onClick={() => action('physical-receipt')}>Record physical receipt date</Button>}{l.replyDispatch?.status !== 'Awaiting dispatch' && <Button variant="outline" onClick={() => action('reply-ready')}>Reply ready for dispatch</Button>}<Button onClick={() => action('action')}>Record action</Button><Button variant="outline" onClick={() => action('reject')}>Return to HOD</Button>{l.delivery !== 'Delivered' && <Button variant="outline" onClick={() => action('missing')}>Original not received</Button>}</>}</div></div>
 </TabsContent><TabsContent value="history"><div className="detail-timeline">{[...l.history].reverse().map((e, i) => <div key={i}><time>{when(e.at)}</time><b>{e.text}</b><p>{e.actor} · {e.role}</p></div>)}</div></TabsContent></Tabs></div>}</SheetContent></Sheet>
 <Dialog open={!!op} onOpenChange={v => !v && setOp(null)}><DialogContent><DialogHeader><DialogTitle>{({ 'physical-receipt': 'Physical letter received', 'reply-ready': 'Reply ready for physical dispatch', assign: 'Assign officer', hod: 'Change responsible HOD', forward: 'Forward to another office', secret: 'Restricted contents', action: 'Record action', reject: 'Return to HOD', missing: 'Report delivery issue' } as Record<string, string>)[op?.type] || 'Update letter'}</DialogTitle><DialogDescription>Your name, time and changes are recorded in the history.</DialogDescription></DialogHeader><form onSubmit={doAction} className="form">{op?.type === 'physical-receipt' && <Field label="Physical letter received date"><Input required type="date" min={l ? sriLankaDate(new Date(l.received)) : undefined} max={sriLankaDate()} value={opDate} onChange={e => setOpDate(e.target.value)}/></Field>}{op?.type === 'reply-ready' && <><p>PEON will receive a task to dispatch the physical reply.</p><Field label="Recipient"><Input required maxLength={200} value={replyRecipient} onChange={e => setReplyRecipient(e.target.value)}/></Field><Field label="Postal address"><Textarea required maxLength={1000} value={replyAddress} onChange={e => setReplyAddress(e.target.value)}/></Field></>}{['assign', 'hod'].includes(op?.type) && <Field label="Responsible person"><Pick label="Choose person" value={opPerson} onChange={setOpPerson} items={people.filter(p => p.active && p.office === l?.office && p.role === (op.type === 'hod' ? 'HOD' : 'Officer'))}/></Field>}{op?.type === 'forward' && <Field label="Destination office"><Pick label="Destination" value={opOffice} onChange={setOpOffice} items={offices.filter(x => x !== l?.office).map(id => ({ id, name: officeName[id] }))}/></Field>}{op?.type === 'action' && <Field label="Action progress"><Pick label="Action progress" value={opStatus} onChange={setOpStatus} items={['In progress', 'Action recorded']}/></Field>}{!['hod', 'physical-receipt'].includes(op?.type) && <Field label={op?.type === 'forward' ? 'Intended recipient / destination notes (optional)' : op?.type === 'assign' ? 'Instructions' : 'Details'}><Textarea required={op?.type !== 'forward'} rows={5} maxLength={4000} value={opText} onChange={e => setOpText(e.target.value)}/></Field>}<Button disabled={busy || (['assign', 'hod'].includes(op?.type) && !opPerson)}>{busy ? 'Saving…' : 'Save change'}</Button></form></DialogContent></Dialog>
 </SidebarProvider>;
}
