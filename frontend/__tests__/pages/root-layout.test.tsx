import React from "react";
import { render, screen } from "@testing-library/react";
import RootLayout from "@/app/layout";

// The root layout renders <html> and <body> which React Testing Library
// renders into a fragment. We just verify the children pass through.
describe("RootLayout", () => {
  it("renders children inside the layout", () => {
    render(
      <RootLayout>
        <div data-testid="child-content">Hello World</div>
      </RootLayout>
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("renders body with antialiased class", () => {
    render(
      <RootLayout>
        <span data-testid="inner">Test</span>
      </RootLayout>
    );
    // jsdom's document.body is where the layout body renders into
    expect(document.body).toHaveClass("antialiased");
  });
});
