// The phase 0 test page. It is deliberately plain: one scrolling ledger that
// exercises the engine and the save system on a real phone. The designed
// five-tab game interface replaces it in phase 1.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import {
  BUILDINGS,
  BUILDING_DEFS,
  HOUR,
  JOB_BUILDING,
  MAX_LEVEL,
  PLANS,
  PLAN_DEFS,
  RESOURCES,
  TRAIT_NAMES,
  assignedVillagers,
  buildBlocker,
  buildDurationMs,
  cancelBuild,
  cityRates,
  jobSlots,
  nextTargetLevel,
  populationCap,
  queueBuild,
  queueSlots,
  setAutoAssign,
  setJobs,
  setPlan,
  storageCap,
  timeToAfford,
  upgradeCost,
  wallTimeOf,
} from '../engine';
import type { AdvanceReport, BuildingId, City, GameState, ResourceId, Resources } from '../engine';
import { GameController } from './controller';
import type { Snapshot } from './controller';
import { ago, amount, clockTime, dateTime, duration, worldAge } from './format';

const controller = new GameController();

/** Remember a small choice on this phone. Never essential, so failures are ignored. */
function recall(key: string): string | null {
  try {
    return localStorage.getItem(`valehalla.ui.${key}`);
  } catch {
    return null;
  }
}
function remember(key: string, value: string): void {
  try {
    localStorage.setItem(`valehalla.ui.${key}`, value);
  } catch {
    // Not remembered. Nothing depends on it.
  }
}

type Tone = 'good' | 'bad';
type Notify = (text: string, tone?: Tone) => void;

const RESOURCE_NAMES: Record<ResourceId, string> = { food: 'Food', timber: 'Timber', metal: 'Metal', wealth: 'Wealth' };
const JOB_NAMES: Record<ResourceId, string> = {
  food: 'Farmers',
  timber: 'Woodcutters',
  metal: 'Miners',
  wealth: 'Merchants',
};

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-panel px-4 pb-4 pt-3.5 shadow-[0_8px_24px_rgba(2,8,20,0.45)]">
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <h2 className="font-book text-[1.4rem] font-bold leading-tight text-ice">{title}</h2>
        {aside && <span className="num rounded-full bg-raised px-2.5 py-0.5 text-sm text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled,
  quiet,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  quiet?: boolean;
  danger?: boolean;
}) {
  const look = danger
    ? 'border-ember bg-ember/10 text-ember'
    : quiet
      ? 'border-line bg-raised text-frost'
      : 'border-azure bg-azure text-night shadow-[0_0_0_1px_rgba(140,200,255,0.25),0_6px_16px_rgba(79,157,255,0.28)]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-lg border px-3.5 py-2 text-[0.95rem] font-bold leading-tight transition-transform duration-75 active:scale-[0.96] disabled:border-line disabled:bg-transparent disabled:text-muted/70 disabled:shadow-none ${look}`}
    >
      {children}
    </button>
  );
}

function costText(cost: Resources, city: City): ReactNode {
  const parts = RESOURCES.filter((r) => cost[r] > 0);
  return parts.map((r, i) => (
    <span key={r} className={city.resources[r] < cost[r] ? 'text-ember' : undefined}>
      {amount(cost[r])} {RESOURCE_NAMES[r].toLowerCase()}
      {i < parts.length - 1 ? ', ' : ''}
    </span>
  ));
}

const RESOURCE_TEXT: Record<ResourceId, string> = {
  food: 'text-food',
  timber: 'text-timber',
  metal: 'text-metal',
  wealth: 'text-wealth',
};
const RESOURCE_FILL: Record<ResourceId, string> = {
  food: 'bg-food',
  timber: 'bg-timber',
  metal: 'bg-metal',
  wealth: 'bg-wealth',
};

function ResourceStrip({ state, city }: { state: GameState; city: City }) {
  const rates = cityRates(state, city);
  const cap = storageCap(city.levels.storehouse);
  return (
    <div className="shrink-0 border-b border-line bg-deep px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="grid grid-cols-4 gap-2">
        {RESOURCES.map((r) => {
          const full = city.resources[r] >= cap;
          return (
            <div key={r} className="overflow-hidden rounded-xl border border-line bg-panel">
              <div className="px-2 pb-1.5 pt-1.5">
                <div className={`flex items-center gap-1.5 text-[0.8rem] font-medium ${RESOURCE_TEXT[r]}`}>
                  <span className={`size-2 rounded-full ${RESOURCE_FILL[r]}`} />
                  {RESOURCE_NAMES[r]}
                </div>
                <div className={`num text-[1.3rem] font-bold leading-tight ${full ? 'text-ember' : 'text-frost'}`}>
                  {amount(city.resources[r])}
                </div>
                <div className={`num text-[0.75rem] ${full ? 'text-ember' : 'text-muted'}`}>
                  {full ? 'Full' : `+${amount(rates[r])}/hr`}
                </div>
              </div>
              <div className="h-1 bg-line">
                <div
                  className={`h-full ${full ? 'bg-ember' : RESOURCE_FILL[r]}`}
                  style={{ width: `${Math.min(100, (city.resources[r] / cap) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AwayReport({ report, city, onDismiss }: { report: AdvanceReport; city: City; onDismiss: () => void }) {
  const gained = report.gained[city.id];
  const wasted = report.wasted[city.id];
  const arrived = report.villagersArrived[city.id] ?? 0;
  const finished = new Map<BuildingId, number>();
  for (const build of report.builds) finished.set(build.building, build.level);
  const lost = wasted ? RESOURCES.filter((r) => wasted[r] >= 1) : [];
  return (
    <div className="mt-4 rounded-2xl border border-azure/60 bg-raised px-4 py-3.5 shadow-[0_0_28px_rgba(79,157,255,0.18)]">
      <h2 className="font-book text-[1.4rem] font-bold leading-tight text-ice">While you were away</h2>
      <p className="mt-1">
        You were gone {duration(report.wallElapsedMs)}.
        {report.frozenMs > 0
          ? ` The valley ran for ${duration(report.gameElapsedMs)} of that and stood still for ${duration(report.frozenMs)}. The world pauses once you have been away 12 hours.`
          : ''}
      </p>
      {finished.size > 0 && (
        <p className="mt-2">
          Finished: {[...finished].map(([b, level]) => `${BUILDING_DEFS[b].name} ${level}`).join(', ')}.
        </p>
      )}
      {gained && (
        <p className="num mt-2">
          Gathered:{' '}
          {RESOURCES.filter((r) => gained[r] >= 1)
            .map((r) => `${amount(gained[r])} ${RESOURCE_NAMES[r].toLowerCase()}`)
            .join(', ') || 'nothing'}
          .{arrived > 0 ? ` ${arrived} villagers arrived.` : ''}
        </p>
      )}
      {lost.length > 0 && wasted && (
        <p className="num mt-2 text-ember">
          The Storehouse was full, so {lost.map((r) => `${amount(wasted[r])} ${RESOURCE_NAMES[r].toLowerCase()}`).join(', ')}{' '}
          went to waste.
        </p>
      )}
      <div className="mt-3">
        <Button quiet onClick={onDismiss}>
          Close report
        </Button>
      </div>
    </div>
  );
}

function Queue({ state, city, notify }: { state: GameState; city: City; notify: Notify }) {
  const slots = queueSlots(city.levels.keep);
  return (
    <Section title="Under construction" aside={`${city.queue.length} of ${slots} orders`}>
      {city.queue.length === 0 && (
        <p className="py-3 text-muted">Nothing is being built. Order an upgrade below, or choose a city plan.</p>
      )}
      {city.queue.map((item) => {
        const running = item.startedAt !== null && item.completesAt !== null;
        const total = running ? item.completesAt! - item.startedAt! : 0;
        const left = running ? Math.max(0, item.completesAt! - state.clock.gameTime) : 0;
        const done = running && total > 0 ? 1 - left / total : 0;
        return (
          <div key={item.id} className="relative border-b border-line">
            {running && (
              <div className="ink-fill absolute inset-y-0 left-0 rounded-r-md border-b-2 border-azure bg-gradient-to-r from-azure/10 to-azure/30" style={{ width: `${done * 100}%` }} />
            )}
            <div className="relative flex items-center justify-between gap-3 py-2.5">
              <div>
                <div className="font-book text-[1.15rem] font-medium leading-tight">
                  {BUILDING_DEFS[item.building].name} {item.targetLevel}
                </div>
                <div className="num text-sm text-muted">
                  {running
                    ? `${duration(left)} left, done at ${clockTime(wallTimeOf(state, item.completesAt!))}`
                    : 'Waiting its turn'}
                  {item.byPlan ? ', ordered by the plan' : ''}
                </div>
              </div>
              <Button
                quiet
                onClick={() => {
                  if (controller.act((s) => cancelBuild(s, city.id, item.id)).ok) {
                    notify(`${BUILDING_DEFS[item.building].name} ${item.targetLevel} cancelled and refunded`);
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function Plan({ city, notify }: { city: City; notify: Notify }) {
  const choices = [null, ...PLANS];
  return (
    <Section title="City plan">
      <p className="py-2 text-muted">
        {city.plan
          ? `${PLAN_DEFS[city.plan].summary} The plan places orders by itself, even while the game is closed.`
          : 'No plan. Every order is yours to place.'}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {choices.map((plan) => {
          const chosen = city.plan === plan;
          return (
            <button
              key={plan ?? 'none'}
              type="button"
              aria-pressed={chosen}
              onClick={() => {
                if (chosen) return;
                controller.act((s) => setPlan(s, city.id, plan));
                notify(plan ? `${PLAN_DEFS[plan].name} plan is running` : 'Plan off. Orders are yours to place');
              }}
              className={`min-h-11 rounded-lg border px-1 py-2 text-[0.9rem] font-bold leading-tight ${
                chosen ? 'border-azure bg-azure text-night' : 'border-line bg-raised text-frost'
              }`}
            >
              {plan ? PLAN_DEFS[plan].name : 'By hand'}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function blockerText(city: City, building: BuildingId): string | null {
  switch (buildBlocker(city, building)) {
    case 'max-level':
      return city.levels[building] >= MAX_LEVEL ? 'Fully built' : 'Final level already ordered';
    case 'requirements': {
      const needs = Object.entries(BUILDING_DEFS[building].requires)
        .filter(([b, level]) => city.levels[b as BuildingId] < level)
        .map(([b, level]) => `${BUILDING_DEFS[b as BuildingId].name} ${level}`);
      return `Needs ${needs.join(' and ')}`;
    }
    case 'queue-full':
      return 'No free order slot';
    case 'cannot-afford':
      return 'Not enough resources';
    default:
      return null;
  }
}

/** When the city will be able to pay for something it cannot afford yet. */
function waitText(state: GameState, city: City, cost: Resources): string {
  if (RESOURCES.some((r) => cost[r] > storageCap(city.levels.storehouse))) return 'Costs more than the Storehouse can hold';
  const wait = timeToAfford(state, city, cost);
  if (wait === null) {
    const missing = RESOURCES.filter((r) => cost[r] > city.resources[r] && cityRates(state, city)[r] <= 0);
    return `No income of ${missing.map((r) => RESOURCE_NAMES[r].toLowerCase()).join(' or ')} yet`;
  }
  return `Enough in ${duration(wait)}`;
}

function Buildings({ state, city, notify }: { state: GameState; city: City; notify: Notify }) {
  return (
    <Section title="Buildings">
      {BUILDINGS.map((b) => {
        const target = nextTargetLevel(city, b);
        const blocker = blockerText(city, b);
        const cost = target > MAX_LEVEL ? null : upgradeCost(b, target);
        const short = cost !== null && RESOURCES.some((r) => city.resources[r] < cost[r]);
        const locked = blocker !== null && blocker.startsWith('Needs');
        return (
          <div key={b} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0 last:pb-0">
            <div className="min-w-0">
              <div className="font-book text-[1.2rem] font-medium leading-tight">
                {BUILDING_DEFS[b].name}{' '}
                <span className="num whitespace-nowrap font-hand text-[0.95rem] font-normal text-muted">
                  {city.levels[b] === 0 ? 'not built' : `level ${city.levels[b]}`}
                </span>
              </div>
              {cost ? (
                <>
                  <div className="num mt-0.5 text-[0.92rem] leading-snug text-muted">{costText(cost, city)}</div>
                  <div className="num text-[0.92rem] leading-snug text-muted">
                    <span className="whitespace-nowrap">Takes {duration(buildDurationMs(b, target, city.levels.keep))}</span>
                    {locked && <span className="text-gold"> · {blocker}</span>}
                    {!locked && short && <span className="text-ember"> · {waitText(state, city, cost)}</span>}
                    {!locked && !short && blocker && <span> · {blocker}</span>}
                  </div>
                </>
              ) : (
                <div className="mt-0.5 text-[0.92rem] text-muted">{blocker}</div>
              )}
            </div>
            <div className="w-[6.6rem] shrink-0 [&>button]:w-full">
              <Button
                disabled={blocker !== null}
                onClick={() => {
                  const result = controller.act((s) => queueBuild(s, city.id, b));
                  if (result.ok) notify(`${BUILDING_DEFS[b].name} ${target} ordered`);
                  else notify('That order could not be placed', 'bad');
                }}
              >
                {city.levels[b] === 0 && target === 1 ? 'Build' : `Raise to ${Math.min(target, MAX_LEVEL)}`}
              </Button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function Villagers({ city }: { city: City }) {
  const working = assignedVillagers(city);
  const idle = city.villagers - working;
  const setJob = (r: ResourceId, wanted: number) => {
    // A job can take its own workers plus whoever is idle, up to its slots.
    const value = Math.max(0, Math.min(wanted, jobSlots(city, r), city.jobs[r] + idle));
    if (value !== city.jobs[r]) controller.act((s) => setJobs(s, city.id, { ...city.jobs, [r]: value }));
  };
  return (
    <Section title="Villagers" aside={`${city.villagers} of ${populationCap(city.levels.farm)}`}>
      <label className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-2">
        <span>
          <span className="font-medium">Share them out for me</span>
          <span className="block text-sm text-muted">New villagers go to work by themselves</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={city.autoAssign}
          onChange={(e) => controller.act((s) => setAutoAssign(s, city.id, e.target.checked))}
        />
      </label>
      <p className="py-2.5 text-muted">
        {idle > 0
          ? `${idle} have no work. Raise a job building to make room, or move a slider.`
          : 'Everyone has work. Drag a slider to move villagers between jobs.'}
      </p>
      {RESOURCES.map((r) => {
        const slots = jobSlots(city, r);
        return (
          <div key={r} className="border-b border-line py-2.5 last:border-b-0 last:pb-0">
            <div className="flex items-baseline justify-between">
              <span className={`font-medium ${RESOURCE_TEXT[r]}`}>{JOB_NAMES[r]}</span>
              <span className="num text-muted">
                {slots === 0 ? `Build a ${BUILDING_DEFS[JOB_BUILDING[r]].name} first` : `${city.jobs[r]} of ${slots}`}
              </span>
            </div>
            <input
              type="range"
              className={`slider ${RESOURCE_TEXT[r]}`}
              aria-label={JOB_NAMES[r]}
              min={0}
              max={Math.max(1, slots)}
              step={1}
              disabled={slots === 0}
              value={city.jobs[r]}
              onChange={(e) => setJob(r, Number(e.target.value))}
            />
          </div>
        );
      })}
    </Section>
  );
}

function ConfirmButton({ label, confirmLabel, onConfirm, disabled }: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button quiet disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        danger
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button quiet onClick={() => setAsking(false)}>
        Keep this world
      </Button>
    </span>
  );
}

function Saves({ snap }: { snap: Snapshot }) {
  const { save } = snap;
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportFile = async () => {
    const text = controller.exportText();
    if (!text) return;
    const name = `valehalla-save-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([text], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch {
      return; // The share sheet was closed.
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Section title="Saves">
      <p className="num py-2">
        {save.lastLocalSaveAt
          ? `Saved to this phone ${ago(save.lastLocalSaveAt, snap.now)}. Save number ${save.revision}.`
          : 'Not saved yet.'}
      </p>
      <p className="text-muted">
        The game saves after every order and every few seconds.{' '}
        {snap.storageProtected === true && 'This phone has agreed to keep the save from being cleared automatically.'}
        {snap.storageProtected === false &&
          'This phone has not promised to keep the save. Installing to the home screen and turning on cloud backup makes it safe.'}
      </p>
      {snap.notices.map((notice) => (
        <p key={notice} className="mt-2 text-ember">
          {notice}
        </p>
      ))}

      <h3 className="mt-6 font-book text-[1.15rem] font-bold text-ice">Cloud backup</h3>
      {!save.hasToken ? (
        <>
          <p className="py-1 text-muted">
            Paste a GitHub token that is allowed to use Gists. The game then copies your save to a private Gist every few
            minutes, and can bring it back on a new or wiped phone.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="GitHub token"
              aria-label="GitHub token"
              autoComplete="off"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-night px-3 text-frost placeholder:text-muted"
            />
            <Button
              disabled={token.trim().length < 20}
              onClick={() => {
                controller.setToken(token);
                setToken('');
                setMessage(null);
              }}
            >
              Turn on backup
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="num py-1">
            {snap.cloudBusy
              ? 'Talking to GitHub.'
              : save.cloudMessage
                ? save.cloudMessage
                : save.lastCloudAt
                  ? `Backed up ${ago(save.lastCloudAt, snap.now)}. Save number ${save.cloudRevision}.`
                  : 'Backup is on. The first copy goes up in a moment.'}
          </p>
          {snap.cloudConflict && (
            <div className="mt-2 rounded-xl border border-ember/60 bg-ember/10 px-4 py-3">
              <p>
                The cloud already holds {snap.cloudConflict.worldId === snap.state?.worldId ? 'a newer copy of this empire' : 'a different empire'}
                : save number {snap.cloudConflict.revision}, {worldAge(snap.cloudConflict.gameTime).toLowerCase()}, last saved{' '}
                {dateTime(snap.cloudConflict.savedAtWall)}. Nothing has been overwritten.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={async () => setMessage(await controller.restoreFromCloud())}
                  disabled={snap.cloudBusy}
                >
                  Play the cloud empire
                </Button>
                <ConfirmButton
                  label="Replace it with this one"
                  confirmLabel="Yes, replace the cloud copy"
                  onConfirm={() => void controller.backup(true)}
                  disabled={snap.cloudBusy}
                />
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button quiet disabled={snap.cloudBusy || snap.cloudConflict !== null} onClick={() => void controller.backup()}>
              Back up now
            </Button>
            <ConfirmButton
              label="Restore from cloud"
              confirmLabel="Yes, replace this world"
              disabled={snap.cloudBusy}
              onConfirm={async () => setMessage(await controller.restoreFromCloud())}
            />
            <Button quiet onClick={() => controller.setToken(null)}>
              Remove token
            </Button>
          </div>
        </>
      )}

      <h3 className="mt-6 font-book text-[1.15rem] font-bold text-ice">Save file</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button quiet onClick={() => void exportFile()}>
          Export save file
        </Button>
        <Button quiet onClick={() => fileInput.current?.click()}>
          Import save file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) setMessage(await controller.importText(await file.text()));
          }}
        />
      </div>
      {message && <p className="mt-2 text-ember">{message}</p>}

      <h3 className="mt-6 font-book text-[1.15rem] font-bold text-ice">Start over</h3>
      <p className="py-1 text-muted">Founds a new city in a new world. The current world is replaced.</p>
      <ConfirmButton
        label="Start a new world"
        confirmLabel="Yes, abandon this world"
        onConfirm={() => void controller.startNewWorld()}
      />
    </Section>
  );
}

function InstallHint() {
  const [hidden, setHidden] = useState(() => recall('installHintClosed') === '1');
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || hidden) return null;
  return (
    <div className="mt-4 rounded-2xl border border-gold/50 bg-gold/10 px-4 py-3 text-frost">
      <p>
        To install on an iPhone, open this page in Safari, tap Share, then Add to Home Screen. Play from the home screen
        icon: Safari and the installed game keep separate saves.
      </p>
      <div className="mt-3">
        <Button
          quiet
          onClick={() => {
            remember('installHintClosed', '1');
            setHidden(true);
          }}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}

type TabId = 'city' | 'people' | 'saves';

const TAB_ICONS: Record<TabId, ReactNode> = {
  city: <path d="M4 21V9h3v3h3V5h4v7h3V9h3v12h-6v-5h-4v5z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.500 20c0-3.600 2.900-6 6.500-6s6.500 2.400 6.500 6z" />
      <circle cx="17.500" cy="9.500" r="2.500" />
      <path d="M17 14.500c2.800 0 4.800 1.900 4.800 5.500h-4.300c0-2-.6-3.800-1.700-5.200.4-.2.800-.3 1.200-.3z" />
    </>
  ),
  saves: <path d="M5 3h11l3 3v15H5zM8 3v6h7V3zM8 21v-7h8v7z" fillRule="evenodd" />,
};
const TAB_NAMES: Record<TabId, string> = { city: 'City', people: 'Villagers', saves: 'Saves' };
const TABS: TabId[] = ['city', 'people', 'saves'];

function TabBar({ tab, onChange, alerts }: { tab: TabId; onChange: (tab: TabId) => void; alerts: Record<TabId, boolean> }) {
  return (
    <nav
      aria-label="Sections"
      className="grid shrink-0 grid-cols-3 border-t border-line bg-deep pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((id) => {
        const current = id === tab;
        return (
          <button
            key={id}
            type="button"
            aria-current={current ? 'page' : undefined}
            onClick={() => onChange(id)}
            className={`relative flex min-h-[3.6rem] flex-col items-center justify-center gap-0.5 text-[0.8rem] font-medium active:bg-raised ${
              current ? 'text-ice' : 'text-muted'
            }`}
          >
            {current && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b bg-azure" />}
            <span className="relative">
              <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
                {TAB_ICONS[id]}
              </svg>
              {alerts[id] && <span className="absolute -right-1.5 -top-0.5 size-2.5 rounded-full bg-ember" />}
            </span>
            {TAB_NAMES[id]}
          </button>
        );
      })}
    </nav>
  );
}

export function App() {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [tab, setTab] = useState<TabId>(() => {
    const saved = recall('tab');
    return TABS.includes(saved as TabId) ? (saved as TabId) : 'city';
  });
  const [toast, setToast] = useState<{ text: string; tone: Tone; id: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void controller.start();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const notify: Notify = (text, tone = 'good') => setToast({ text, tone, id: Date.now() });
  const changeTab = (next: TabId) => {
    setTab(next);
    remember('tab', next);
    scroller.current?.scrollTo({ top: 0 });
  };

  const state = snap.state;
  const city = state?.cities[0];
  if (snap.phase === 'loading' || !state || !city) {
    return <p className="p-6 pt-[max(1.5rem,env(safe-area-inset-top))] font-book text-xl text-ice">Opening the gates.</p>;
  }
  const frozenHours = Math.floor(state.clock.frozenMs / HOUR);
  const alerts: Record<TabId, boolean> = {
    city: false,
    people: city.villagers - assignedVillagers(city) > 0 && !city.autoAssign,
    saves: snap.cloudConflict !== null || snap.notices.length > 0 || snap.save.localFailures.length > 0,
  };

  return (
    <div className="fixed inset-0 mx-auto flex max-w-xl flex-col">
      <ResourceStrip state={state} city={city} />
      <main ref={scroller} className="scroller min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        {snap.awayReport && (
          <AwayReport report={snap.awayReport} city={city} onDismiss={() => controller.dismissAwayReport()} />
        )}
        {tab === 'city' && (
          <>
            <header className="pt-5">
              <h1 className="bg-gradient-to-br from-frost via-ice to-azure bg-clip-text pb-1 font-book text-[2.6rem] font-bold leading-none text-transparent">
                {city.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {city.traits.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-azure/50 bg-azure/15 px-3 py-0.5 text-sm font-medium text-ice"
                  >
                    {TRAIT_NAMES[t]}
                  </span>
                ))}
                <span className="num text-sm text-muted">{worldAge(state.clock.gameTime)}</span>
              </div>
              {frozenHours > 0 && (
                <p className="mt-2 text-sm text-muted">The valley has stood still for {frozenHours} hours in all.</p>
              )}
            </header>
            <InstallHint />
            <Queue state={state} city={city} notify={notify} />
            <Plan city={city} notify={notify} />
            <Buildings state={state} city={city} notify={notify} />
          </>
        )}
        {tab === 'people' && <Villagers city={city} />}
        {tab === 'saves' && (
          <>
            <Saves snap={snap} />
            <p className="mt-6 text-sm text-muted">
              Valehalla, phase 0 test build. This page exists to prove the engine and the saves on your phone. The real
              game screens come next.
            </p>
          </>
        )}
      </main>
      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-[calc(4.4rem+env(safe-area-inset-bottom))] flex justify-center px-4">
        {toast && (
          <div
            key={toast.id}
            className={`toast rounded-full border px-4 py-2 text-[0.95rem] font-medium shadow-[0_8px_24px_rgba(2,8,20,0.6)] ${
              toast.tone === 'good' ? 'border-azure bg-raised text-frost' : 'border-ember bg-raised text-ember'
            }`}
          >
            {toast.text}
          </div>
        )}
      </div>
      <TabBar tab={tab} onChange={changeTab} alerts={alerts} />
    </div>
  );
}
