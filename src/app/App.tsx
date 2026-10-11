// The phase 0 test page. It is deliberately plain: one scrolling ledger that
// exercises the engine and the save system on a real phone. The designed
// five-tab game interface replaces it in phase 1.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import {
  BUILDINGS,
  BUILDING_DEFS,
  HOUR,
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
  upgradeCost,
  wallTimeOf,
} from '../engine';
import type { AdvanceReport, BuildingId, City, GameState, ResourceId, Resources } from '../engine';
import { GameController } from './controller';
import type { Snapshot } from './controller';
import { ago, amount, clockTime, dateTime, duration, worldAge } from './format';

const controller = new GameController();

const RESOURCE_NAMES: Record<ResourceId, string> = { food: 'Food', timber: 'Timber', metal: 'Metal', wealth: 'Wealth' };
const JOB_NAMES: Record<ResourceId, string> = {
  food: 'Farmers',
  timber: 'Woodcutters',
  metal: 'Miners',
  wealth: 'Merchants',
};

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-9">
      <div className="flex items-baseline justify-between border-b border-ink pb-1">
        <h2 className="font-book text-[1.4rem] font-bold leading-tight">{title}</h2>
        {aside && <span className="num text-sm text-lichen">{aside}</span>}
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
    ? 'border-rust text-rust'
    : quiet
      ? 'border-ink text-ink'
      : 'border-ink bg-ink text-bone';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-sm border px-3.5 py-2 text-[0.95rem] font-medium leading-tight active:translate-y-px disabled:border-rule disabled:bg-transparent disabled:text-lichen ${look}`}
    >
      {children}
    </button>
  );
}

function costText(cost: Resources, city: City): ReactNode {
  const parts = RESOURCES.filter((r) => cost[r] > 0);
  return parts.map((r, i) => (
    <span key={r} className={city.resources[r] < cost[r] ? 'text-rust' : undefined}>
      {amount(cost[r])} {RESOURCE_NAMES[r].toLowerCase()}
      {i < parts.length - 1 ? ', ' : ''}
    </span>
  ));
}

function ResourceStrip({ state, city }: { state: GameState; city: City }) {
  const rates = cityRates(state, city);
  const cap = storageCap(city.levels.storehouse);
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-ink bg-fog px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="grid grid-cols-4 gap-3 pb-2">
        {RESOURCES.map((r) => {
          const full = city.resources[r] >= cap;
          return (
            <div key={r}>
              <div className="text-[0.8rem] text-lichen">{RESOURCE_NAMES[r]}</div>
              <div className={`num text-[1.25rem] font-bold leading-tight ${full ? 'text-rust' : ''}`}>
                {amount(city.resources[r])}
              </div>
              <div className="num text-[0.8rem] text-lichen">{full ? 'full' : `+${amount(rates[r])} an hour`}</div>
              <div className="mt-1 h-[3px] bg-rule">
                <div
                  className={`h-full ${full ? 'bg-rust' : 'bg-moss'}`}
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
    <div className="mt-5 border-l-4 border-moss bg-bone px-4 py-3">
      <h2 className="font-book text-[1.4rem] font-bold leading-tight">While you were away</h2>
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
        <p className="num mt-2 text-rust">
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

function Queue({ state, city }: { state: GameState; city: City }) {
  const slots = queueSlots(city.levels.keep);
  return (
    <Section title="Under construction" aside={`${city.queue.length} of ${slots} orders`}>
      {city.queue.length === 0 && (
        <p className="py-3 text-lichen">Nothing is being built. Order an upgrade below, or choose a city plan.</p>
      )}
      {city.queue.map((item) => {
        const running = item.startedAt !== null && item.completesAt !== null;
        const total = running ? item.completesAt! - item.startedAt! : 0;
        const left = running ? Math.max(0, item.completesAt! - state.clock.gameTime) : 0;
        const done = running && total > 0 ? 1 - left / total : 0;
        return (
          <div key={item.id} className="relative border-b border-rule">
            {running && (
              <div className="ink-fill absolute inset-y-0 left-0 bg-tallow/45" style={{ width: `${done * 100}%` }} />
            )}
            <div className="relative flex items-center justify-between gap-3 py-2.5">
              <div>
                <div className="font-book text-[1.15rem] font-medium leading-tight">
                  {BUILDING_DEFS[item.building].name} {item.targetLevel}
                </div>
                <div className="num text-sm text-lichen">
                  {running
                    ? `${duration(left)} left, done at ${clockTime(wallTimeOf(state, item.completesAt!))}`
                    : 'Waiting its turn'}
                  {item.byPlan ? ', ordered by the plan' : ''}
                </div>
              </div>
              <Button quiet onClick={() => controller.act((s) => cancelBuild(s, city.id, item.id))}>
                Cancel
              </Button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function Plan({ city }: { city: City }) {
  const choices = [null, ...PLANS];
  return (
    <Section title="City plan">
      <p className="py-2 text-lichen">
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
              onClick={() => controller.act((s) => setPlan(s, city.id, plan))}
              className={`min-h-11 rounded-sm border px-1 py-2 text-[0.9rem] font-medium leading-tight ${
                chosen ? 'border-ink bg-ink text-bone' : 'border-ink text-ink'
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

function Buildings({ city }: { city: City }) {
  return (
    <Section title="Buildings">
      {BUILDINGS.map((b) => {
        const target = nextTargetLevel(city, b);
        const blocker = blockerText(city, b);
        const atCap = target > MAX_LEVEL;
        const cost = atCap ? null : upgradeCost(b, target);
        const tooBig = cost ? RESOURCES.some((r) => cost[r] > storageCap(city.levels.storehouse)) : false;
        return (
          <div key={b} className="flex items-center justify-between gap-3 border-b border-rule py-2.5">
            <div className="min-w-0">
              <div className="font-book text-[1.15rem] font-medium leading-tight">
                {BUILDING_DEFS[b].name}{' '}
                <span className="num font-hand text-[0.95rem] font-normal text-lichen">
                  {city.levels[b] === 0 ? 'not built' : `level ${city.levels[b]}`}
                </span>
              </div>
              <div className="num text-sm leading-snug text-lichen">
                {cost ? (
                  <>
                    {costText(cost, city)}, {duration(buildDurationMs(b, target, city.levels.keep))}
                  </>
                ) : (
                  blocker
                )}
              </div>
              {cost && blocker && blocker !== 'Not enough resources' && (
                <div className="text-sm leading-snug text-lichen">{blocker}</div>
              )}
              {tooBig && <div className="text-sm leading-snug text-rust">Costs more than the Storehouse can hold</div>}
            </div>
            <div className="shrink-0">
              <Button disabled={blocker !== null} onClick={() => controller.act((s) => queueBuild(s, city.id, b))}>
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
  const change = (r: ResourceId, by: number) =>
    controller.act((s) => setJobs(s, city.id, { ...city.jobs, [r]: city.jobs[r] + by }));
  return (
    <Section title="Villagers" aside={`${city.villagers} of ${populationCap(city.levels.farm)}`}>
      <p className="py-2 text-lichen">
        {idle > 0 ? `${idle} have no work. Raise a job building to make room for them.` : 'Everyone has work.'}
      </p>
      {RESOURCES.map((r) => {
        const slots = jobSlots(city, r);
        return (
          <div key={r} className="flex items-center justify-between gap-3 border-b border-rule py-2">
            <div>
              <span className="font-medium">{JOB_NAMES[r]}</span>{' '}
              <span className="num text-lichen">{slots === 0 ? 'no building yet' : `${city.jobs[r]} of ${slots}`}</span>
            </div>
            <div className="flex gap-2">
              <Button quiet disabled={city.autoAssign || city.jobs[r] <= 0} onClick={() => change(r, -1)}>
                <span aria-label={`One fewer ${JOB_NAMES[r].toLowerCase()}`}>−</span>
              </Button>
              <Button quiet disabled={city.autoAssign || city.jobs[r] >= slots || idle <= 0} onClick={() => change(r, 1)}>
                <span aria-label={`One more ${JOB_NAMES[r].toLowerCase()}`}>+</span>
              </Button>
            </div>
          </div>
        );
      })}
      <label className="mt-3 flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5 accent-[#4f6b4a]"
          checked={city.autoAssign}
          onChange={(e) => controller.act((s) => setAutoAssign(s, city.id, e.target.checked))}
        />
        <span>Share villagers out evenly for me</span>
      </label>
    </Section>
  );
}

/** A button that asks once more before doing something that replaces the current world. */
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
      <p className="text-lichen">
        The game saves after every order and every few seconds.{' '}
        {snap.storageProtected === true && 'This phone has agreed to keep the save from being cleared automatically.'}
        {snap.storageProtected === false &&
          'This phone has not promised to keep the save. Installing to the home screen and turning on cloud backup makes it safe.'}
      </p>
      {snap.notices.map((notice) => (
        <p key={notice} className="mt-2 text-rust">
          {notice}
        </p>
      ))}

      <h3 className="mt-6 font-book text-[1.15rem] font-bold">Cloud backup</h3>
      {!save.hasToken ? (
        <>
          <p className="py-1 text-lichen">
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
              className="min-h-11 min-w-0 flex-1 rounded-sm border border-ink bg-bone px-3"
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
            <div className="mt-2 border-l-4 border-rust bg-bone px-4 py-3">
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

      <h3 className="mt-6 font-book text-[1.15rem] font-bold">Save file</h3>
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
      {message && <p className="mt-2 text-rust">{message}</p>}

      <h3 className="mt-6 font-book text-[1.15rem] font-bold">Start over</h3>
      <p className="py-1 text-lichen">Founds a new city in a new world. The current world is replaced.</p>
      <ConfirmButton
        label="Start a new world"
        confirmLabel="Yes, abandon this world"
        onConfirm={() => void controller.startNewWorld()}
      />
    </Section>
  );
}

function InstallHint() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return null;
  return (
    <p className="mt-4 border-l-4 border-tallow bg-bone px-4 py-3">
      To install on an iPhone, open this page in Safari, tap Share, then Add to Home Screen. Play from the home screen
      icon: Safari and the installed game keep separate saves.
    </p>
  );
}

export function App() {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    void controller.start();
  }, []);

  const state = snap.state;
  const city = state?.cities[0];
  if (snap.phase === 'loading' || !state || !city) {
    return <p className="p-6 font-book text-xl">Opening the ledger.</p>;
  }
  const traits = city.traits.map((t) => TRAIT_NAMES[t].toLowerCase());
  const frozenHours = Math.floor(state.clock.frozenMs / HOUR);

  return (
    <main className="mx-auto max-w-xl px-4 pb-[max(3rem,env(safe-area-inset-bottom))]">
      <ResourceStrip state={state} city={city} />
      <header className="pt-5">
        <h1 className="font-book text-[2.6rem] font-bold leading-none">{city.name}</h1>
        <p className="mt-2 text-lichen">
          {/^[aeiou]/.test(traits[0] ?? '') ? 'An' : 'A'} {traits.join(' and ')} site in the valley. <span className="num">{worldAge(state.clock.gameTime)}</span>
          {frozenHours > 0 ? `, with ${frozenHours} hours spent standing still.` : '.'}
        </p>
      </header>
      <InstallHint />
      {snap.awayReport && (
        <AwayReport report={snap.awayReport} city={city} onDismiss={() => controller.dismissAwayReport()} />
      )}
      <Queue state={state} city={city} />
      <Plan city={city} />
      <Buildings city={city} />
      <Villagers city={city} />
      <Saves snap={snap} />
      <p className="mt-10 text-sm text-lichen">
        Valehalla, phase 0 test build. This page exists to prove the engine and the saves on your phone. The real game
        screens come next.
      </p>
    </main>
  );
}
