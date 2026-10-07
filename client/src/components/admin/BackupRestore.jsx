import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Upload } from 'lucide-react';
import api from '../../api/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Admin-only: download a .sql backup of the database, or restore one. A
// restore snapshots the current DB first (server/backups/pre-restore-*.sql)
// so it can be undone.
export default function BackupRestore() {
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
      toast.success(`Database restored. Previous data saved as ${data.snapshot}`, { duration: 8000 });
      // Everything on screen came from the old data.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Restore failed', { duration: 10000 });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader><CardTitle>Download backup</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Saves the whole database (products, orders, stock, customers, settings…) as a .sql file.
          </p>
          <Button asChild className="self-start">
            <a href={`${api.defaults.baseURL}/backup/download`}><Download className="size-4" /> Download .sql backup</a>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader><CardTitle>Restore from backup</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={restore}>
            <p className="text-sm text-muted-foreground">
              Replaces the current data with the data in the backup file. Anything added since that
              backup was taken is lost. A copy of the current database is saved on the server first,
              so a restore can be undone.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="restore-file">Backup file (.sql)</Label>
              <Input id="restore-file" type="file" accept=".sql" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="restore-confirm">Type RESTORE to confirm</Label>
              <Input id="restore-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            </div>
            <Button
              type="submit"
              variant="destructive"
              className="self-start"
              disabled={!file || confirm !== 'RESTORE' || restoring}
            >
              <Upload className="size-4" /> {restoring ? 'Restoring… do not close this page' : 'Restore database'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
