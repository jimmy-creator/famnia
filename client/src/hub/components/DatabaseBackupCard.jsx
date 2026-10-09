import { Download, Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import api from '@/api/axios';
import { Button } from '@/hub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/hub/ui/card';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';

/**
 * Admin-only full database backup (.sql) and restore, on the classic
 * /api/backup endpoints. A restore snapshots the current database on the
 * server first (pre-restore-*.sql), so it can be undone.
 */
export function DatabaseBackupCard() {
  const [file, setFile] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);

  const restore = async (e) => {
    e.preventDefault();
    const body = new FormData();
    body.append('confirm', confirm);
    body.append('file', file);
    setRestoring(true);
    try {
      const { data } = await api.post('/backup/restore', body, { timeout: 0 });
      toast.success(`Database restored. The previous data was saved as ${data.snapshot}.`, { duration: 8000 });
      // Everything on screen came from the old data.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Restore failed', { duration: 10000 });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Full Database Backup (.sql)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Saves the whole database — products, orders, stock, customers, finance, settings — as one .sql file that can be
            restored later. Keep it somewhere safe.
          </p>
          <Button asChild className="h-11">
            <a href={`${api.defaults.baseURL}/backup/download`}>
              <Download className="mr-2 size-4" /> Download .sql backup
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Restore From Backup</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={restore}>
            <p className="text-sm text-muted-foreground">
              Replaces the current data with the data in the backup file. Anything added since that backup was taken is
              lost. A copy of the current database is saved on the server first, so a restore can be undone.
            </p>
            <div>
              <Label htmlFor="hub-restore-file" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Backup file (.sql)
              </Label>
              <Input id="hub-restore-file" type="file" accept=".sql" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <Label htmlFor="hub-restore-confirm" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Type RESTORE to confirm
              </Label>
              <Input
                id="hub-restore-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              variant="destructive"
              className="h-11"
              disabled={!file || confirm !== 'RESTORE' || restoring}
            >
              {restoring ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
              {restoring ? 'Restoring… do not close this page' : 'Restore database'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
