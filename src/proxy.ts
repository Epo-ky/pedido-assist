import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

// Checagem otimista: só decide para onde redirecionar.
// A proteção de verdade é feita no servidor, com getSession(), em cada página e rota de API.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessao = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/chat") && !sessao) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if ((pathname === "/login" || pathname === "/cadastro") && sessao) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/login", "/cadastro"],
};
