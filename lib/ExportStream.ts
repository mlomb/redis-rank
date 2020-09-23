import { Readable, ReadableOptions } from 'stream';
import { Leaderboard } from './Leaderboard';

export interface IExportStreamOptions extends ReadableOptions {
    /** number of entries to retrieve per iteration */
    batchSize: number,
    /** source leaderboard */
    leaderboard: Leaderboard
}

/**
 * A readable stream that iterates all entries in a leaderboard in batches
 * 
 * Note that the stream guarantees to traverse all entries only if there
 * are no updates during retrival
 */
export default class ExportStream extends Readable {
    private _Index = 1;
    private _Done = false;

    constructor(private options: IExportStreamOptions) {
        super({ ...options, objectMode: true });
    }

    _read() {
        if(this._Done) {
            this.push(null);
            return;
        }

        this.options.leaderboard.list(this._Index, this._Index + this.options.batchSize - 1).then((entries) => {
            if(entries.length < this.options.batchSize) {
                // finished
                this._Done = true;
            }
            this._Index += this.options.batchSize;
            this.push(entries);
        }).catch((err) => this.emit('error', err));
    }

    _destroy(_error: Error | null, callback: (error?: Error | null) => void) {
        this._Done = true;
        callback();
    }
}