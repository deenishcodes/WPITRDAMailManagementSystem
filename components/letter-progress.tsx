import type { Letter } from '@/lib/model';

const time = (value?: string) => value
  ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' })
  : 'Not recorded';

export function LetterDates({ letter }: { letter: Letter }) {
  return <dl className="metadata letter-dates">
    <div><dt>Digital assignment</dt><dd>{time(letter.assignedAt)}</dd></div>
    <div><dt>Officer physical receipt date</dt><dd>{letter.physicalReceivedDate || 'Not recorded'}</dd></div>
    <div><dt>Latest action recorded</dt><dd>{time(letter.actionAt)}</dd></div>
  </dl>;
}

export function ReplyStatus({ letter }: { letter: Letter }) {
  const reply = letter.replyDispatch;
  if (!reply) return null;
  return <section className="instruction">
    <b>Physical reply: {reply.status}</b>
    <p>{reply.recipient} · {reply.address}</p>
    <p>{reply.note}</p>
    <p>Ready: {time(reply.readyAt)}{reply.dispatchedAt && ` · Dispatched: ${time(reply.dispatchedAt)}`}</p>
    {reply.dispatchNote && <p>{reply.dispatchNote}</p>}
  </section>;
}
