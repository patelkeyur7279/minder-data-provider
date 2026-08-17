import type { GetServerSidePropsContext } from "next";

jest.mock("minder-data-provider", () => ({
  minder: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { minder } from "minder-data-provider";
import { getServerSideProps } from "../pages/ssr-users";

const mockedMinder = minder as jest.MockedFunction<typeof minder>;

describe("pages/ssr-users getServerSideProps", () => {
  afterEach(() => {
    mockedMinder.mockReset();
  });

  it("passes the upstream users through as props on success", async () => {
    mockedMinder.mockResolvedValueOnce({
      data: [{ id: 1, name: "Ada" }],
      error: null,
      success: true,
      status: 200,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await getServerSideProps({} as GetServerSidePropsContext);

    expect("props" in result).toBe(true);
    if ("props" in result) {
      expect(result.props.users).toEqual([{ id: 1, name: "Ada" }]);
      expect(result.props.error).toBeNull();
    }
    expect(mockedMinder).toHaveBeenCalledWith(
      "/users",
      undefined,
      expect.objectContaining({ transport: "fetch" })
    );
  });

  it("surfaces an error message and an empty list when the upstream call fails", async () => {
    mockedMinder.mockResolvedValueOnce({
      data: null,
      error: { message: "upstream unreachable" },
      success: false,
      status: 502,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await getServerSideProps({} as GetServerSidePropsContext);

    expect("props" in result).toBe(true);
    if ("props" in result) {
      expect(result.props.users).toEqual([]);
      expect(result.props.error).toBe("upstream unreachable");
    }
  });
});
