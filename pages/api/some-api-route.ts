// /pages/api/some-api-route.ts
import { withStats } from './lib/withStats';

export default withStats(async (req, res) => {
  res.status(200).json({ message: 'Hello!' });
});