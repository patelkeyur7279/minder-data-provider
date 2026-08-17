import type { NextApiRequest, NextApiResponse } from "next";

type User = {
  id: number;
  name: string;
  email: string;
};

const USERS: User[] = [
  { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
  { id: 2, name: "Alan Turing", email: "alan@example.com" },
  { id: 3, name: "Grace Hopper", email: "grace@example.com" },
];

export default function handler(req: NextApiRequest, res: NextApiResponse<User[]>) {
  res.status(200).json(USERS);
}
