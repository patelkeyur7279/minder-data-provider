import type { NextApiRequest, NextApiResponse } from "next";
import handler from "../pages/api/users";

type User = { id: number; name: string; email: string };

function createMockRes() {
  const res = {} as NextApiResponse<User[]> & { statusCode?: number; jsonBody?: User[] };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as NextApiResponse<User[]>["status"];
  res.json = jest.fn((body: User[]) => {
    res.jsonBody = body;
    return res;
  }) as unknown as NextApiResponse<User[]>["json"];
  return res;
}

describe("pages/api/users", () => {
  it("returns 200 with a user list containing an Ada entry", () => {
    const req = {} as NextApiRequest;
    const res = createMockRes();

    handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    expect(Array.isArray(res.jsonBody)).toBe(true);
    expect(res.jsonBody?.some((user) => user.name.includes("Ada"))).toBe(true);
  });
});
