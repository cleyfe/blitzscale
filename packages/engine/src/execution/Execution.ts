import type { GameImpl } from '../game/GameImpl';

/**
 * A unit of game behaviour. Every intent becomes an execution, and the
 * long-running systems (economy, events, bots, win check) are executions too.
 * `init` runs once on the tick it is added; `tick` runs every tick while active.
 */
export interface Execution {
  init(game: GameImpl): void;
  tick(game: GameImpl): void;
  isActive(): boolean;
}

/** Base for intents that take effect immediately and then finish. */
export abstract class InstantExecution implements Execution {
  private done = false;
  init(game: GameImpl): void {
    this.apply(game);
    this.done = true;
  }
  tick(): void {}
  isActive(): boolean {
    return !this.done;
  }
  protected abstract apply(game: GameImpl): void;
}
