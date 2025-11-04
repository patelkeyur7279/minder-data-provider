import Cors from 'cors';

const cors = Cors({
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

const corsMiddleware = (req: any, res: any) => {
  return new Promise((resolve, reject) => {
    cors(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

export default corsMiddleware;