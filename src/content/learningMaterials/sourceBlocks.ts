export type MaterialTextRun = {
  text: string;
  bold?: true;
  underline?: true;
  italic?: true;
  math?: true;
  superscript?: true;
  subscript?: true;
  desktopOnly?: true;
  mobileOnly?: true;
};
export type MaterialParagraphBlock = { type: "paragraph"; variant: "body" | "listItem" | "sectionHeading" | "subheading"; align: "left" | "center" | "right" | "both"; runs: MaterialTextRun[] };
export type MaterialImageBlock = {
  type: "image";
  src: string;
  alt: string;
  align?: "left" | "center" | "right";
};
export type MaterialTableCell = { blocks: MaterialContentBlock[]; colSpan?: number };
export type MaterialTableBlock = {
  type: "table";
  variant: "grid" | "layout" | "graphPaper";
  columnWidths: number[];
  equalColumns?: true;
  graphExercise?: true;
  topAligned?: true;
  rows: { cells: MaterialTableCell[] }[];
};
export type MaterialContentBlock = MaterialParagraphBlock | MaterialImageBlock | MaterialTableBlock;

export const materialSourceBlocks: Record<string, MaterialContentBlock[]> =
{
  "algebra-graphs": [
    {
      "type": "table",
      "variant": "grid",
      "graphExercise": true,
      "columnWidths": [
        5494,
        5494
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[y=x - 3\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "grid",
                  "equalColumns": true,
                  "columnWidths": [
                    390,
                    516,
                    596,
                    516,
                    596,
                    516,
                    596,
                    336
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-3"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-2,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-2"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-1,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-1"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-0,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "0"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "0,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "1"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "1,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "2"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "2,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "3"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Побудуйте графік",
                      "bold": true
                    },
                    {
                      "text": " функції",
                      "bold": true
                    },
                    {
                      "text": ":",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "graphPaper",
                  "columnWidths": [
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[y=-\\frac{1}{2}x-2;\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "grid",
                  "equalColumns": true,
                  "columnWidths": [
                    567,
                    567,
                    567,
                    567,
                    567,
                    567,
                    567,
                    567
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Побудуйте графік",
                      "bold": true
                    },
                    {
                      "text": " функції:",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "graphPaper",
                  "columnWidths": [
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "graphExercise": true,
      "columnWidths": [
        5494,
        5494
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[y= 3x + 1\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "grid",
                  "equalColumns": true,
                  "columnWidths": [
                    567,
                    567,
                    567,
                    567,
                    567,
                    567,
                    567,
                    567
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Побудуйте графік функції:",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "graphPaper",
                  "columnWidths": [
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[y= 0,25x + 1\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "grid",
                  "equalColumns": true,
                  "columnWidths": [
                    567,
                    567,
                    567,
                    567,
                    567,
                    567,
                    567,
                    567
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Побудуйте графік функції:",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "graphPaper",
                  "columnWidths": [
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "graphExercise": true,
      "columnWidths": [
        5494,
        5494
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[y=x - 5\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "grid",
                  "equalColumns": true,
                  "columnWidths": [
                    390,
                    516,
                    596,
                    516,
                    596,
                    516,
                    596,
                    336
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-3"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-2,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-2"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-1,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-1"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "-0,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "0"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "0,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "1"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "1,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "2"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "2,5"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "3"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Побудуйте графік функції:",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "graphPaper",
                  "columnWidths": [
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[y=-\\frac{1}{6}x-5;\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "grid",
                  "equalColumns": true,
                  "columnWidths": [
                    567,
                    567,
                    567,
                    567,
                    567,
                    567,
                    567,
                    567
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "X",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "center",
                              "runs": [
                                {
                                  "text": "Y",
                                  "bold": true
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Побудуйте графік функції:",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "graphPaper",
                  "columnWidths": [
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284,
                    284
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        },
                        {
                          "blocks": []
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "algebra-7": [
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "6. Математичні вирази",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Числовим виразом називають будь-який запис із чисел, знаків арифметичних дій і дужок, що має математичний сенс."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Математичний вираз – це",
          "bold": true
        },
        {
          "text": " фраза, записана за допомогою чисел, знаків і букв. Вираз, записаний тільки за допомогою чисел і знаків, називається числовим."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Наприклад: "
        },
        {
          "text": "\\(\\,3 + 5 \\cdot 7 - 4\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — числовий вираз. ",
          "bold": true
        },
        {
          "text": "\\(\\,3 + {:} - 5\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — НЕ числовий вираз, а безглуздий набір символів",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Буквений вираз",
          "bold": true
        },
        {
          "text": " – це математичний вираз, що містить не тільки числа й знаки дій, а й "
        },
        {
          "text": "букви",
          "italic": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Оскільки букви можна заміняти довільними числами, то ці букви називають "
        },
        {
          "text": "змінними",
          "bold": true
        },
        {
          "text": ", а сам буквений вираз — "
        },
        {
          "text": "виразом зі змінними",
          "bold": true
        },
        {
          "text": " (або зі змінною, якщо вона одна)."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Змінна",
          "bold": true
        },
        {
          "text": " — математична величина, значення якої може змінюватись у межах певної задачі."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Числові вирази та вирази зі змінними називають "
        },
        {
          "text": "алгебраїчними виразами",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Вирази, що не містять ділення на вирази зі змінними, називаються "
        },
        {
          "text": "цілими виразами",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Запис, сполучений знаком рівності, називається "
        },
        {
          "text": "числовою рівністю",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Вирази, відповідні значення яких є рівними при будь-яких значеннях змінних, що входять до них, називають "
        },
        {
          "text": "тотожно рівними",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Рівність, яка є правильною при будь-яких значеннях змінних, що входять до неї, називають "
        },
        {
          "text": "тотожністю",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Заміну одного виразу іншим, тотожно рівним йому, називають"
        },
        {
          "text": " тотожним перетворенням виразу",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Зведення подібних доданків і розкриття дужок — приклади тотожних перетворень виразів."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Спрощення виразу — це заміна його простішим (для розв’язання, для сприйняття), тотожно рівним даному."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Методи тотожних перетворень:"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "both",
      "runs": [
        {
          "text": "1. Розкрити дужки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "both",
      "runs": [
        {
          "text": "2. Звести подібні доданки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "both",
      "runs": [
        {
          "text": "3. Додати до лівої та правої частин рівності одне й те саме число."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "both",
      "runs": [
        {
          "text": "4. Помножити або поділити ліву й праву частини рівності на одне й те саме число (за винятком "
        },
        {
          "text": "\\(0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ")."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "both",
      "runs": [
        {
          "text": "5. Перенести один із доданків через знак "
        },
        {
          "text": "\\(=\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " (з лівої частини рівності до правої або з правої до лівої)."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Приклади тотожних перетворень"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        2802,
        4677,
        3119
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Первинне значення",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Дія",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Результат",
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a - 15 = 0\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Додамо до обох частин рівняння "
                    },
                    {
                      "text": "\\(15\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a = 15\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a = 5\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Помножимо обидві частини рівняння на "
                    },
                    {
                      "text": "\\( -1\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(-a = -5\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(\\frac{a}{5} = 1\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Помножимо обидві частини рівняння на "
                    },

                    {
                      "text": "\\(5\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a = 5\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(3(a + 5) = 1\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Розкриємо дужки"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(3a + 15 = 1\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Приклад розкриття дужок та зведення доданків"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        2802,
        4677,
        3119
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Первинне значення",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Дія",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Результат",
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\((a+2)(a+3)=0\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a^{2}+3a+2a+6 = 0\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Перемножимо всі складові дужок по черзі"
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Зведемо подібні доданки"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a^{2}+3a+2a+6 = 0\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a^{2}+5a+6 = 0\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Розкриття дужок"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": " Щоб помножити одночлен на многочлен, треба помножити цей одночлен на кожний член многочлена й додати знайдені добутки. Множення одночлена на многочлен"
        }
      ]
    },
    {
      "type": "image",
      "src": "/materials/source/algebra-7/02-image1.png",
      "alt": "Схема розкриття дужок: одночлен 5x множиться на 3x і на мінус 7"
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Розкласти многочлен на множники означає подати його у вигляді добутку одночлена на многочлен або добутку кількох многочленів так, щоб цей добуток був тотожно рівним даному многочлену."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Розкладання многочленів на множники способом винесення спільного множника за дужки"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "center",
      "runs": [
        {
          "text": "\\[8m+4=\\underline4\\cdot2m+\\underline4\\cdot1=4(2m+1)\\]",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "center",
      "runs": [
        {
          "text": "\\[at+7ap=a(t+7p)\\]",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        5494,
        5494
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Множення многочлена на многочлен"
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[(a+b)(x+y)=(a+b)m=am+bm\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/algebra-7/01-image5.png",
                  "alt": "Схема множення многочленів: кожний член першого многочлена множиться на кожний член другого",
                  "align": "left"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Щоб помножити многочлен на многочлен, треба кожний член одного многочлена помножити на кожний член другого многочлена й одержані добутки додати."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Розкладання многочленів на множники способом групування"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "center",
      "runs": [
        {
          "text": "\\[ab-5a+2b-10\\]",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "center",
      "runs": [
        {
          "text": "\\[(ab-5a)+(2b-10)=a(b-5)+2(b-5)\\]",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "center",
      "runs": [
        {
          "text": "\\[a\\underline{(b-5)}+2\\underline{(b-5)}=(b-5)(a+2)\\]",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1) розбити многочлен на групи доданків, кожна з яких містить спільний множник; "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2) з кожної групи винести спільний множник за дужки; "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3) спільний для всіх груп множник, що утворився, винести за дужки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "8. Рівняння",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Рівняння — це",
          "bold": true
        },
        {
          "text": " рівність, що містить позначене буквою невідоме число, яке потрібно знайти."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Рівняння виду "
        },
        {
          "text": "\\(ax= b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", де "
        },
        {
          "text": "\\(x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — змінна, "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і "
        },
        {
          "text": "\\(b\\)",
          "math": true,
          "bold": true
        },
                {
          "text": " — деякі числа, "
        },
        {
          "text": "називають лінійним рівнянням з однією змінною",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Розв’язання лінійних рівнянь"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Розв’яжемо рівняння "
        },
        {
          "text": "\\(ax= b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " для різних значень "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і "
        },
        {
          "text": "\\(b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        },
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1) Якщо "
        },
        {
          "text": "\\(a \\ne 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", то, поділивши обидві частини рівняння "
        },
        {
          "text": "\\(ax = b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " на "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", отримаємо "
        },
        {
          "text": "\\(x = \\frac{b}{a}\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Тоді можна зробити такий висновок: якщо "
        },
        {
          "text": "\\(a \\ne 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", то рівняння "
        },
        {
          "text": "\\(ax = b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " має єдиний корінь, що дорівнює "
        },
        {
          "text": "\\(\\frac{b}{a}\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2) Якщо "
        },
        {
          "text": "\\(a = 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", то лінійне рівняння набуває такого вигляду: "
        },
        {
          "text": "\\(0x = b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Тоді можливі два випадки: "
        },
        {
          "text": "\\(b = 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " або "
        },
        {
          "text": "\\(b \\ne 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". У першому випадку отримуємо рівняння "
        },
        {
          "text": "\\(0x = 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Тоді можна зробити такий висновок: якщо "
        },
        {
          "text": "\\(a = 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " та "
        },
        {
          "text": "\\(b = 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", то рівняння "
        },
        {
          "text": "\\(ax = b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " має безліч коренів: будь-яке число є його коренем."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "У другому випадку, коли "
        },
        {
          "text": "\\(b \\ne 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", при будь-якому значенні "
        },
        {
          "text": "\\(x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " маємо хибну рівність "
        },
        {
          "text": "\\(0x = b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Тоді можна зробити такий висновок: якщо "
        },
        {
          "text": "\\(a = 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " та "
        },
        {
          "text": "\\(b \\ne 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", то рівняння "
        },
        {
          "text": "\\(ax = b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " коренів не має."
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        2747,
        2747,
        2747,
        2747
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Значення ",
                      "bold": true
                    },
                    {
                      "text": "\\(a\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і ",
                      "bold": true
                    },
                    {
                      "text": "\\(b\\)",
                      "math": true,
                      "bold": true
                    },
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a \\ne 0\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a = 0,\\,b = 0\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a = 0,\\,b \\ne 0\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Корені рівняння "
                    },
                    {
                      "text": "\\(ax = b\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(x = \\frac{b}{a}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(x\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " — будь-яке число"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Коренів немає"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм вирішення рівнянь"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        3750,
        5900,
        3750
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Первинне значення",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Дія",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Результат",
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(3(a+2)-2(3a-6)=14+a\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Розкриємо дужки"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(3a+6-6a+12=14+a\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(3a+6-6a+12=14+a\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Зведемо подібні доданки"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(-3a+18=14+a\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(-3a+18=14+a\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Перенесемо/залишимо всі елементи з "
                    },
                    {
                      "text": "\\(a\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " зліва від знаку "
                    },
                    {
                      "text": "\\(=\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", а без "
                    },
                    {
                      "text": "\\(a\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " – справа"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(-4a=-4\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(-4a=-4\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Ділимо обидві частини на значення (коефіцієнт, що стоїть при "
                    },
                    {
                      "text": "\\(a\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ") "
                    },
                    {
                      "text": "\\(\\,-4\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a=1\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(3(a+2)-2(3a-6)=14+a\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Підставляємо знайдене значення "
                    },
                    {
                      "text": "\\(a=1\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " до первинного рівняння (для перевірки)"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(3(1+2)-2(3-6)=14+1\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(9+6=15\\qquad15=15\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "12. Текстові задачі:",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Рівняння, складене за умовою реальної ситуації, називають "
        },
        {
          "text": "математичною моделлю",
          "bold": true
        },
        {
          "text": " даної ситуації."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Алгоритм розв’язування задач",
          "bold": true
        },
        {
          "text": " – це послідовність дій, які необхідно виконати для вирішення задачі."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Алгоритм розв’язання задач на складання рівняння: "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1) за умовою задачі скласти рівняння (побудувати математичну модель задачі); "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2) розв’язати отримане рівняння; "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3) з’ясувати, чи відповідає знайдений корінь змісту задачі, і дати відповідь."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм складання рівняння:"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Що є невідомим (що є "
        },
        {
          "text": "\\(x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ")?"
        },
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Виразіть через "
        },
        {
          "text": "\\(x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " всі елементи, описані в задачі."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Запишіть рівняння, що відображає співвідношення елементів."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "10. Ступені та корені",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Ступенем числа "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " з натуральним показником "
        },
        {
          "text": "\\(n (n > 1)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають добуток "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " множників, кожний з яких дорівнює "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "center",
      "runs": [
        {
          "text": "\\[\\underbrace{4\\cdot4\\cdot4\\cdot4\\cdot4\\cdot4}_{6\\text{ множників}}=4^6\\]",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Ступінь з основою "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і показником "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " записують так: "
        },
        {
          "text": "\\(a^n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", читають: «"
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " в ступені "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "» або «"
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "-й ступінь числа "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "»"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "\\(a^2\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають квадратом числа "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", "
        },
        {
          "text": "\\(a^3\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають кубом числа "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Властивості ступеня"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        3100,
        3100,
        3100,
        3100,
        3100
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a^{n}a^{m}=a^{(n+m)}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a^{n}a^{m}a^{k}=a^{(n+m+k)}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a^{n}:a^{m}=a^{(n-m)}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\((a^{n})^{m}=a^{(nm)}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\((ab)^{n}=a^{n}b^{n}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a^{2}a^{3}= a^{(2+3)}= a^{5}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a^{2}a^{3}a^{5}= a^{(2+3+5)}= a^{10}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a^{5}: a^{3}= a^{(5-3)}= a^{2}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\((a^{5})^{2}= a^{(2\\cdot{}5)}=a^{10}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\((ab)^{3}=a^{3}b^{3}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Вирази, що є добутком чисел, змінних та їхніх ступенів, називають "
        },
        {
          "text": "одночленами",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Вигляд одночлена, який містить тільки один числовий множник, відмінний від нуля, що стоїть на першому місці, називають "
        },
        {
          "text": "стандартним виглядом одночлена.",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Числовий множник одночлена, записаного в стандартному вигляді, називають "
        },
        {
          "text": "коефіцієнтом одночлена",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Одночлени, в яких буквені частини є тотожно рівними виразами, називають "
        },
        {
          "text": "подібними",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Ступенем одночлена",
          "bold": true
        },
        {
          "text": " називають суму показників ступенів усіх змінних, що входять до нього."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Ступінь одночлена, який є числом, відмінним від нуля, вважають рівним нулю."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Вираз, який є сумою кількох одночленів, називають многочленом."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Якщо серед одночленів, з яких складається многочлен, є подібні, то їх називають подібними членами многочлена."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Многочлен, складений з одночленів стандартного вигляду, серед яких немає подібних, називають многочленом стандартного вигляду."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Ступенем многочлена стандартного вигляду називають найбільший зі ступенів одночленів, з яких цей многочлен складений."
        }
      ]
    }
  ],
  "algebra-8-complex": [
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "6. Математичні вирази",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Порядок дій"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        10768
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Дії в алгебраїчних виразах мають такі послідовності:",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "listItem",
                  "align": "left",
                  "runs": [
                    {
                      "text": "1. Дужки",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "listItem",
                  "align": "left",
                  "runs": [
                    {
                      "text": "2. Ступені та корені",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "listItem",
                  "align": "left",
                  "runs": [
                    {
                      "text": "3. Множення та ділення",
                      "bold": true
                    },
                    {
                      "text": " - виконуються "
                    },
                    {
                      "text": "зліва направо",
                      "bold": true
                    },
                    {
                      "text": " у тому порядку, як стоять у виразі."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "listItem",
                  "align": "left",
                  "runs": [
                    {
                      "text": "4. Додавання та віднімання",
                      "bold": true
                    },
                    {
                      "text": " - виконуються "
                    },
                    {
                      "text": "зліва направо",
                      "bold": true
                    },
                    {
                      "text": " у тому порядку, як стоять у виразі."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "2. Арифметичні дії",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Робота із від’ємними числами"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "topAligned": true,
      "columnWidths": [
        5381,
        5381
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "1. Додавання від’ємних чисел",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо додаємо два від’ємних числа – результат від’ємний, сума абсолютних значень.",
                      "italic": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(-4+(-5)=-9\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо додаємо від’ємне до додатного",
                      "bold": true
                    },
                    {
                      "text": ", то:"
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "listItem",
                  "align": "left",
                  "runs": [
                    {
                      "text": "• Якщо "
                    },
                    {
                      "text": "додатне більше",
                      "bold": true
                    },
                    {
                      "text": ", результат додатний. "
                    },
                    {
                      "text": "\\[7+(-3)=4\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "listItem",
                  "align": "left",
                  "runs": [
                    {
                      "text": "• Якщо "
                    },
                    {
                      "text": "від’ємне більше",
                      "bold": true
                    },
                    {
                      "text": ", результат від’ємний. "
                    },
                    {
                      "text": "\\[-6+2=-4\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "2. Віднімання від’ємних чисел",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Віднімання від’ємного числа",
                      "bold": true
                    },
                    {
                      "text": " = "
                    },
                    {
                      "text": "додавання його протилежного",
                      "bold": true
                    },
                    {
                      "text": " (мінус на мінус — дає плюс)."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[5-(-2)=5+2=7\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Загальне правило:",
                      "bold": true
                    },
                    {
                      "text": "\\[a-(-b)=a+b\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[a-(+b)=a-b\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "3. Множення чисел з різними знаками",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "grid",
                  "columnWidths": [
                    1413,
                    1417,
                    1418
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "×"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Додатне"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Від’ємне"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Додатне"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Додатне"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Від’ємне"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Від’ємне"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Від’ємне"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Додатне"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[-3\\times{}4=-12\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[-3\\times{}-4=12\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "4. Ділення чисел з різними знаками",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "table",
                  "variant": "grid",
                  "columnWidths": [
                    1413,
                    1417,
                    1418
                  ],
                  "rows": [
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "÷"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Додатне"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Від’ємне"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Додатне"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Додатне"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Від’ємне"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "cells": [
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Від’ємне"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Від’ємне"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "blocks": [
                            {
                              "type": "paragraph",
                              "variant": "body",
                              "align": "left",
                              "runs": [
                                {
                                  "text": "Додатне"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[-12\\div{}3=-4\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[-12\\div{}-3=4\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "5. Ступені з від’ємними числами",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\((-2)^{2}=(-2)\\times{}(-2)=4\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\(-2^{2}=-(2^{2})=-4\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ],
              "colSpan": 2
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "6. Математичні вирази",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Еквівалентні перетворення"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "topAligned": true,
      "columnWidths": [
        4957,
        5805
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "1. Додавання або віднімання однакових виразів з обох частин рівняння",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(x+3=7\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(x=4\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "2. Множення або ділення обох частин на одне й те саме (ненульове!) число",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(3x=12\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Поділимо обидві частини на 3:"
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(x=4\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "3. Розкриття дужок",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Можна розкривати дужки, використовуючи дистрибутивну властивість:"
                    },
                    {
                      "text": "\\[a(b+c)=ab+ac\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[2(x+3)=14\\]",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": "\\[2x+6=14\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "4. Перенесення членів з однієї частини рівняння в іншу зі зміною знака",
                      "bold": true
                    },
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "це теж додавання/віднімання, просто в скороченій формі."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[x+5=8\\]",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": "Переносимо 5 в праву частину зі знаком «–»:"
                    },
                    {
                      "text": "\\[x=8-5=3\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "5. Заміна виразу рівним йому",
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Будь-який вираз у рівнянні можна замінити на "
                    },
                    {
                      "text": "інший рівний вираз",
                      "bold": true
                    },
                    {
                      "text": "."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[x+x=10\\]",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": "Можна записати як "
                    },
                    {
                      "text": "\\[2x=10\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ],
              "colSpan": 2
            }
          ]
        }
      ]
    }
  ],
  "algebra-8-fractions": [
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "5. Дроби",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Дробові вирази",
          "bold": true
        },
        {
          "text": " — містять ділення на вираз зі змінними. "
        },
        {
          "text": "Допустимі значення змінних",
          "bold": true
        },
        {
          "text": " — такі, при яких цей вираз має зміст."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Цілі та дробові вирази",
          "bold": true
        },
        {
          "text": " називають "
        },
        {
          "text": "раціональними виразами",
          "bold": true
        },
        {
          "text": ". Якщо в "
        },
        {
          "text": "раціональному виразі",
          "bold": true
        },
        {
          "text": " замінити змінні числами, то отримаємо "
        },
        {
          "text": "числовий вираз",
          "bold": true
        },
        {
          "text": ". Проте ця заміна можлива лише тоді, коли вона "
        },
        {
          "text": "не призводить до ділення на нуль",
          "bold": true
        },
        {
          "text": ". "
        },
        {
          "text": "Раціональний дріб",
          "bold": true
        },
        {
          "text": " - це дріб, чисельником і знаменником якого є многочлени."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Вирази, відповідні значення яких рівні "
        },
        {
          "text": "при будь-яких допустимих значеннях змінних",
          "bold": true
        },
        {
          "text": ", що в них входять, називають "
        },
        {
          "text": "тотожно рівними",
          "bold": true
        },
        {
          "text": ". "
        },
        {
          "text": "Рівність, яка виконується при будь-яких допустимих значеннях змінних, що в неї входять, називають "
        },
        {
          "text": "тотожністю",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "table",
      "variant": "layout",
      "columnWidths": [
        1800,
        1418,
        1134,
        2844,
        3792
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[\\frac{a}{b}=\\frac{am}{bm}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a,b,m\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " — деякі числа,"
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(b \\ne{} 0\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(m \\ne{} 0\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ],
              "colSpan": 2
            },
            {
              "blocks": [],
              "colSpan": 2
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо чисельник і знаменник раціонального дробу помножити на один і той самий ненульовий многочлен, то отримаємо дріб, тотожно рівний даному, цю властивість називають "
                    },
                    {
                      "text": "основною властивістю раціонального дробу",
                      "bold": true
                    },
                    {
                      "text": " й записують:"
                    }
                  ]
                }
              ],
              "colSpan": 4
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[\\frac{A}{B}=\\frac{A\\cdot C}{B\\cdot C}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "де A, B і C — многочлени, причому многочлени B і C ненульові."
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[\\frac{A\\cdot C}{B\\cdot C}= \\frac{A}{B}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ],
              "colSpan": 2
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Таке тотожне перетворення називають скороченням дробу на множник C."
                    }
                  ]
                }
              ],
              "colSpan": 3
            }
          ]
        }
      ]
    },
    {
      "type": "table",
      "variant": "layout",
      "columnWidths": [
        8330,
        2658
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Щоб додати раціональні дроби з однаковими знаменниками, треба додати їхні чисельники, а знаменник залишити той самий."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[\\frac{a}{c}+\\frac{b}{c}=\\frac{a+b}{c}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "table",
      "variant": "layout",
      "columnWidths": [
        2802,
        8186
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[\\frac{a}{c}-\\frac{b}{c}=\\frac{a-b}{c}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Щоб відняти раціональні дроби з однаковими знаменниками, треба від чисельника першого дробу відняти чисельник другого дробу, а знаменник залишити той самий."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "table",
      "variant": "layout",
      "columnWidths": [
        6062,
        4926
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Для складання дробів із різним знаменником за спільний знаменник вибрано вираз, який дорівнює "
                    },
                    {
                      "text": "добутку знаменників даних дробів",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[\\frac{A}{B}+\\frac{C}{D}=\\frac{A\\cdot D}{B\\cdot D}+\\frac{C\\cdot B}{D\\cdot B}=\\frac{A\\cdot D+C\\cdot B}{B\\cdot D}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "table",
      "variant": "layout",
      "columnWidths": [
        2093,
        8895
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[\\frac{a}{b}\\cdot \\frac{c}{d}=\\frac{ac}{bd}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Добутком двох раціональних дробів",
                      "bold": true
                    },
                    {
                      "text": " є раціональний дріб, чисельник якого дорівнює добутку чисельників даних дробів, а знаменник — добутку їхніх знаменників."
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[\\frac{a}{b}:\\frac{c}{d}=\\frac{ad}{bc}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Часткою двох раціональних дробів",
                      "bold": true
                    },
                    {
                      "text": " є раціональний дріб, чисельник якого дорівнює добутку чисельника діленого та знаменника дільника, а знаменник — добутку знаменника діленого та чисельника дільника."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Піднесення дробу до ступеня"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        1590,
        9398
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[\\left(\\frac{A}{B}\\right)^n=\\frac{A^n}{B^n}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Щоб піднести раціональний дріб до степеня, треба піднести до цього степеня чисельник і знаменник. Перший результат записати як чисельник, а другий — як знаменник дробу."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "8. Рівняння",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Рівносильні рівняння"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Два рівняння називають "
        },
        {
          "text": "рівносильними",
          "bold": true
        },
        {
          "text": ", якщо вони мають одні й ті самі корені або кожне з рівнянь не має коренів."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Дії, що створюють рівняння рівносильне даного:"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        6912,
        4076
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "До обох частин даного рівняння "
                    },
                    {
                      "text": "додати",
                      "bold": true
                    },
                    {
                      "text": " (або відняти) одне й те саме число, то отримаємо рівняння"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[2a+c=0\\Leftrightarrow 2a+c+d=d\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[2a+c=0\\Leftrightarrow 2a+c-2e=-2e\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Який-небудь доданок перенести з однієї частини рівняння в другу, змінивши його "
                    },
                    {
                      "text": "знак на протилежний",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[2a+c=0\\Leftrightarrow 2a=-c\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Обидві частини рівняння "
                    },
                    {
                      "text": "помножити (поділити) на одне й те саме відмінне від нуля число",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\[2a+c=0\\Leftrightarrow 4a+2c=0\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "10. Ступені та корені",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Піднесення до ступеня"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        2660,
        2661,
        2555,
        2392
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[{a}^{m}\\cdot {a}^{n}={a}^{m+n}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[{({a}^{m})}^{n}={a}^{mn}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[{(ab)}^{n}={a}^{n}\\cdot {b}^{n}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[{a}^{m}:{a}^{n}={a}^{m-n}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[{a}^{-n}=\\frac{1}{{a}^{n}}\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "\\[\\sqrt{a}=b, {b}^{2}=a\\]",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Корені"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Квадратним коренем",
          "bold": true,
          "underline": true
        },
        {
          "text": " із числа "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають число, квадрат якого дорівнює "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ":",
          "bold": true
        },
        {
          "text": "\\(\\qquad\\sqrt{a}=b, a={b}^{2}\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Арифметичним квадратним коренем",
          "bold": true,
          "underline": true
        },
        {
          "text": " із числа "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають "
        },
        {
          "text": "невід’ємне",
          "bold": true
        },
        {
          "text": "  число, квадрат якого дорівнює "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Вираз, який стоїть під радикалом, називають "
        },
        {
          "text": "підкореневим виразом",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Дію знаходження арифметичного квадратного кореня із числа називають "
        },
        {
          "text": "добуванням квадратного кореня",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Для будь-якого дійсного числа "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " виконується рівність "
        },
        {
          "text": "\\(\\sqrt{{a}^{2}}=\\left|a\\right|\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Для будь-якого дійсного числа "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " та будь-якого натурального числа "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " виконується рівність "
        },
        {
          "text": "\\(\\sqrt{{a}^{2n}}=\\left|{a}^{n}\\right|\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Для будь-яких дійсних чисел "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і "
        },
        {
          "text": "\\(b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " таких, що "
        },
        {
          "text": "\\(a \\ge{} 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і "
        },
        {
          "text": "\\(b \\ge{} 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", виконується рівність "
        },
        {
          "text": "\\(\\sqrt{ab}=\\sqrt{a }\\cdot \\sqrt{b}\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "\\(\\sqrt{abc}=\\sqrt{(ab)c}=\\sqrt{ab }\\cdot \\sqrt{c}=\\sqrt{a }\\cdot \\sqrt{b}\\cdot \\sqrt{c}\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "\\(\\qquad\\sqrt{\\frac{a}{b}}=\\frac{\\sqrt{a}}{\\sqrt{b}}\\)",
          "math": true,
          "bold": true
        }
      ]
    }
  ],
  "algebra-9": [
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "4. Рівності та нерівності",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Число "
        },
        {
          "text": "a",
          "bold": true
        },
        {
          "text": " вважають більшим за число "
        },
        {
          "text": "b",
          "bold": true
        },
        {
          "text": ", якщо різниця "
        },
        {
          "text": "a – b",
          "bold": true
        },
        {
          "text": " є "
        },
        {
          "text": "додатним",
          "bold": true
        },
        {
          "text": " числом. "
        },
        {
          "text": "\\(a>b, a-b>0\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Число "
        },
        {
          "text": "a",
          "bold": true
        },
        {
          "text": " вважають меншим від числа "
        },
        {
          "text": "b",
          "bold": true
        },
        {
          "text": ", якщо різниця "
        },
        {
          "text": "a – b",
          "bold": true
        },
        {
          "text": " є від’ємним числом."
        },
        {
          "text": " "
        },
        {
          "text": "\\(a<b, a-b<0\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Основні властивості числових нерівностей"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        2093,
        3544,
        5351
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "\\(a>b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(b>c\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "то "
                    },
                    {
                      "text": "\\(a>c\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "\\(a>b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(c\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " — будь-яке число, "
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "то "
                    },
                    {
                      "text": "\\(a + c>b + c\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "\\(a>b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(c\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " — додатне число, то "
                    },
                    {
                      "text": "\\(ac>bc\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ". "
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "\\(a>b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(c\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " — від'ємне число, то "
                    },
                    {
                      "text": "\\(ac<bc\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": "."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        1951,
        2126,
        6911
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "\\(ab>0\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(a>b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "то  "
                    },
                    {
                      "text": "\\(\\frac{1}{a}<\\frac{1}{b}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "\\(a>b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(c>d\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "то "
                    },
                    {
                      "text": "\\(a + c > b + d\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "\\(a>b, c>d\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(a\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(c\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(d\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " — додатні числа, "
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "то "
                    },
                    {
                      "text": "\\(ac>bd\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        10988
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "\\(a>b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(a\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " — додатні числа, то "
                    },
                    {
                      "text": "\\(a^{n}>b^{n}\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", де "
                    },
                    {
                      "text": "\\(n\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " — натуральне число"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Розв’язки нерівності"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Розв’язком нерівності з однією змінною називають значення змінної, яке перетворює її в правильну числову нерівність."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Розв’язати нерівність означає знайти всі її розв’язки або довести, що розв’язків не існує."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Розв’язати нерівність означає знайти множину її розв’язків."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Нерівності",
          "bold": true
        },
        {
          "text": " називають "
        },
        {
          "text": "рівносильними",
          "bold": true
        },
        {
          "text": ", якщо вони мають одну й ту саму множину розв’язків."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Нерівності, проміжки за зображення"
        }
      ]
    },
    {
      "type": "image",
      "src": "/materials/source/algebra-9/01-image1.png",
      "alt": "Ілюстрація 1 до матеріалу «Алгебра 9 клас»"
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Множина допустимих значень змінної ",
          "bold": true
        },
        {
          "text": "\\(x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", тобто всі значення змінної "
        },
        {
          "text": "\\(x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", при яких даний вираз ",
        },
        {
          "text": "має зміст",
          "bold": true
        },
        {
          "text": ". Цю множину називають "
        },
        {
          "text": "областю визначення виразу",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Розв’язком системи нерівностей з однією змінною називають значення змінної, яке "
        },
        {
          "text": "перетворює кожну нерівність системи в правильну числову нерівність",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Розв’язати систему нерівностей означає "
        },
        {
          "text": "знайти всі її розв’язки",
          "bold": true
        },
        {
          "text": " або довести, що "
        },
        {
          "text": "розв’язків немає",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Розв’язки системи нерівностей утворюють множину розв’язків системи нерівностей"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "14. Функції",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": " Нехай "
        },
        {
          "text": "X",
          "bold": true
        },
        {
          "text": " — множина значень незалежної змінної, "
        },
        {
          "text": "Y",
          "bold": true
        },
        {
          "text": " — множина значень залежної змінної. "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Функція",
          "bold": true
        },
        {
          "text": " — "
        },
        {
          "text": "це правило",
          "bold": true
        },
        {
          "text": ", за допомогою якого за кожним значенням незалежної змінної з множини X можна знайти єдине значення залежної змінної з множини Y. "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Нуль функції"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Значення аргументу, при якому значення функції дорівнює нулю, називають "
        },
        {
          "text": "нулем функції",
          "bold": true
        },
        {
          "text": ". "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Проміжок знакосталості функції"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Проміжок, на якому функція набуває значень однакового знака, називають "
        },
        {
          "text": "проміжком знакосталості функції",
          "bold": true
        },
        {
          "text": ". "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Зростання і спадання функції"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Функцію називають "
        },
        {
          "text": "зростаючою",
          "bold": true
        },
        {
          "text": " на деякому проміжку, якщо для будь-яких значень аргументу із цього проміжку "
        },
        {
          "text": "більшому значенню аргументу",
          "bold": true
        },
        {
          "text": " відповідає "
        },
        {
          "text": "більше значення функції",
          "bold": true
        },
        {
          "text": ". Функцію називають "
        },
        {
          "text": "спадною",
          "bold": true
        },
        {
          "text": " на деякому проміжку, якщо для будь-яких "
        },
        {
          "text": "значень аргументу",
          "bold": true
        },
        {
          "text": " із цього проміжку більшому значенню аргументу відповідає "
        },
        {
          "text": "менше значення функції",
          "bold": true
        },
        {
          "text": ". "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Побудова графіка функції "
        },
        {
          "text": "\\(y =kf(x)\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Графік функції "
        },
        {
          "text": "\\(y =kf(x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " можна отримати з графіка функції "
        },
        {
          "text": "\\(y = f (x)y\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " результаті розтягнення в "
        },
        {
          "text": "\\(k\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " разів від осі абсцис, якщо "
        },
        {
          "text": "\\(k>1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", або в результаті стискання в"
        },
        {
          "text": "\\(k>1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " разів"
        },
        {
          "text": " до осі абсцис, якщо "
        },
        {
          "text": "\\(k>1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", або в результаті стискання в "
        },
        {
          "text": "\\(\\frac{1}{k}\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " раза до осі абсцис, якщо "
        },
        {
          "text": "\\(0<k<1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Побудова графіка функції "
        },
        {
          "text": "\\(y = f (x) + b\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Графік функції "
        },
        {
          "text": "\\(y = f (x) + b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " можна отримати в результаті паралельного перенесення графіка функції "
        },
        {
          "text": "\\(y = f (x)y\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "вздовж осі ординат на "
        },
        {
          "text": "\\(b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " одиниць угору, якщо "
        },
        {
          "text": "\\(b>0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", і на "
        },
        {
          "text": "\\(-b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " одиниць униз, якщо "
        },
        {
          "text": "\\(b<0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Побудова графіка функції "
        },
        {
          "text": "\\(y = f (x + a)\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": " Графік функції "
        },
        {
          "text": "\\(y = f (x + a)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " можна отримати в результаті паралельного перенесення графіка функції "
        },
        {
          "text": "\\(y = f (x)y\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "вздовж осі абсцис на "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " одиниць уліво, якщо "
        },
        {
          "text": "\\(a>0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", і на "
        },
        {
          "text": "\\(-a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " одиниць управо, якщо "
        },
        {
          "text": "\\(a<0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Квадратична функція"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Функцію, яку можна задати формулою виду "
        },
        {
          "text": "\\(y = ax^{2}+bx+ c\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", де "
        },
        {
          "text": "\\(x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — незалежна змінна, "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", "
        },
        {
          "text": "\\(b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і "
        },
        {
          "text": "\\(c\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — деякі числа, причому "
        },
        {
          "text": "\\(a \\ne{} 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", називають квадратичною."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Квадратні нерівності"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": " Нерівності виду "
        },
        {
          "text": "\\(ax^{2}+bx+c>0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", "
        },
        {
          "text": "\\(ax^{2}+bx+c<0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", "
        },
        {
          "text": "\\(ax^{2}+bx+c\\geq0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", "
        },
        {
          "text": "\\(ax^{2}+bx+c\\leq0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", де "
        },
        {
          "text": "\\(x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — змінна, "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", "
        },
        {
          "text": "\\(b\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і "
        },
        {
          "text": "\\(c\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — деякі числа, причому "
        },
        {
          "text": "\\(a \\ne{} 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", називають квадратними."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Схематичне розміщення параболи "
        },
        {
          "text": "\\(y = ax^{2}+bx+ c\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " відносно осі абсцис"
        }
      ]
    },
    {
      "type": "image",
      "src": "/materials/source/algebra-9/02-image2.png",
      "alt": "Ілюстрація 2 до матеріалу «Алгебра 9 клас»"
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "21. Комбінаторика. Прогресії",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Послідовність"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Об’єкти, які пронумеровано поспіль натуральними числами "
        },
        {
          "text": "\\(1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", ",
          "bold": true
        },
        {
          "text": "\\(2\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", ",
          "bold": true
        },
        {
          "text": "\\(3\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", ",
          "bold": true
        },
        {
          "text": "\\(...\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", ",
          "bold": true
        },
        {
          "text": " "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", ",
          "bold": true
        },
        {
          "text": " ..., ",
          "bold": true
        },
        {
          "text": " утворюють послідовності. "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Арифметична прогресія"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Послідовність, кожний член якої, починаючи з другого, дорівнює попередньому члену, до якого додано одне й те саме число, називають арифметичною прогресією."
        },
        {
          "text": " Формула "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " -го члена арифметичної прогресії: "
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\(a_{n}= a_{1}+ d (n - 1)\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Формула n-го члена арифметичної прогресії"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Будь-який член арифметичної прогресії, крім першого (і останнього, якщо прогресія є скінченною), дорівнює середньому арифметичному двох сусідніх із ним членів: "
        },
        {
          "text": "\\(a_n=\\frac{a_{n-1}+a_{n+1}}{2}\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Формули суми n перших членів арифметичної прогресії: ",
          "bold": true
        },
        {
          "text": "\\(S_n=\\frac{a_1+a_n}{2}\\cdot n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", "
        },
        {
          "text": "\\(S_n=\\frac{2a_1+d(n-1)}{2}\\cdot n\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Геометрична прогресія"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Геометричною прогресією називають послідовність із відмінним від нуля першим членом, кожний член якої, починаючи з другого, дорівнює попередньому члену, помноженому на одне й те саме відмінне від нуля число."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Формула "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "-го члена геометричної прогресії: "
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\({b}_{n}= {b}_{1}{q}^{n-1}\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Властивість членів геометричної прогресії"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Квадрат будь-якого члена геометричної прогресії, крім першого (і останнього, якщо прогресія є скінченною), дорівнює добутку двох сусідніх із ним членів: "
        },
        {
          "text": "\\({b}_{n}^{2}={b}_{n-1}{b}_{n+1}\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Формула суми ",
          "bold": true
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " перших членів геометричної прогресії: ",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "\\[{S}_{n}=\\frac{{b}_{1}({q}^{n}-1)}{q-1}\\]",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "22. Теорія ймовірностей",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Класичне означення ймовірності"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Подію, яка "
        },
        {
          "text": "обов’язково відбудеться",
          "bold": true
        },
        {
          "text": " в будь-якому випробуванні, називають "
        },
        {
          "text": "достовірною",
          "bold": true
        },
        {
          "text": " (вірогідною). "
        },
        {
          "text": " Ймовірність такої події вважають рівною 1, тобто: якщо "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — "
        },
        {
          "text": "достовірна подія",
          "bold": true
        },
        {
          "text": ", то "
        },
        {
          "text": "\\(P(A) = 1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Подію, яка за даним комплексом умов "
        },
        {
          "text": "не може відбутися",
          "bold": true
        },
        {
          "text": " в жодному випробуванні, називають "
        },
        {
          "text": "неможливою",
          "bold": true
        },
        {
          "text": ". Ймовірність такої події вважають рівною "
        },
        {
          "text": "\\(0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", тобто: якщо "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — неможлива подія, то "
        },
        {
          "text": "\\(P (A) = 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Класичне визначення ймовірності"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Якщо випробування може закінчитися одним з "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " рівноможливих результатів, з яких "
        },
        {
          "text": "\\(m\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " призводять до настання події "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", то ймовірністю події "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають відношення "
        },
        {
          "text": "\\(\\frac{m}{n}\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        },
        {
          "text": "   "
        },
        {
          "text": "\\(\\; P (A) = \\frac{m}{n}\\)",
          "math": true,
          "bold": true
        }
      ]
    }
  ],
  "algebra-10": [
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "1. Елементарні дії",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Підмножина"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Множину "
        },
        {
          "text": "\\(B\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають підмножиною множини "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", якщо кожний елемент множини "
        },
        {
          "text": "\\(B\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " є елементом множини "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Якщо "
        },
        {
          "text": "\\(B\\subset{}A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "і"
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\(B \\ne{} A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", то множину "
        },
        {
          "text": "\\(B\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають власною підмножиною множини "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Операції над множинами"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        1251,
        9737
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/algebra-10/01-image1.png",
                  "alt": "Ілюстрація 1 до матеріалу «Алгебра 10 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "both",
                  "runs": [
                    {
                      "text": "Перерізом",
                      "bold": true
                    },
                    {
                      "text": " множин "
                    },
                    {
                      "text": "A",
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "B",
                      "bold": true
                    },
                    {
                      "text": " називають "
                    },
                    {
                      "text": "множину",
                      "bold": true
                    },
                    {
                      "text": ", яка складається з усіх елементів, що належать і множині "
                    },
                    {
                      "text": "A",
                      "bold": true
                    },
                    {
                      "text": ", і множині "
                    },
                    {
                      "text": "B",
                      "bold": true
                    },
                    {
                      "text": ". "
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/algebra-10/02-image2.png",
                  "alt": "Ілюстрація 2 до матеріалу «Алгебра 10 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "both",
                  "runs": [
                    {
                      "text": "Об’єднанням",
                      "bold": true
                    },
                    {
                      "text": " множин "
                    },
                    {
                      "text": "A",
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "B",
                      "bold": true
                    },
                    {
                      "text": " називають множину, яка складається з усіх елементів, що належать хоча б одній із цих множин: або множині "
                    },
                    {
                      "text": "A",
                      "bold": true
                    },
                    {
                      "text": ", або множині "
                    },
                    {
                      "text": "B",
                      "bold": true
                    },
                    {
                      "text": ". "
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/algebra-10/03-image3.png",
                  "alt": "Ілюстрація 3 до матеріалу «Алгебра 10 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "both",
                  "runs": [
                    {
                      "text": "Різницею",
                      "bold": true
                    },
                    {
                      "text": " множин "
                    },
                    {
                      "text": "A",
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "B",
                      "bold": true
                    },
                    {
                      "text": " називають множину, яка складається з усіх елементів, які належать множині "
                    },
                    {
                      "text": "А",
                      "bold": true
                    },
                    {
                      "text": ", але не належать множині "
                    },
                    {
                      "text": "В",
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/algebra-10/04-image4.png",
                  "alt": "Ілюстрація 4 до матеріалу «Алгебра 10 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "both",
                  "runs": [
                    {
                      "text": "У випадку, коли множина "
                    },
                    {
                      "text": "В",
                      "bold": true
                    },
                    {
                      "text": " є підмножиною множини "
                    },
                    {
                      "text": "А",
                      "bold": true
                    },
                    {
                      "text": ", різницю "
                    },
                    {
                      "text": "A \\ B",
                      "bold": true
                    },
                    {
                      "text": " називають "
                    },
                    {
                      "text": "доповненням множини",
                      "bold": true
                    },
                    {
                      "text": " "
                    },
                    {
                      "text": "В",
                      "bold": true
                    },
                    {
                      "text": " у множині "
                    },
                    {
                      "text": "А",
                      "bold": true
                    },
                    {
                      "text": "."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "14. Функції",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Функція"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Нехай "
        },
        {
          "text": "X",
          "bold": true
        },
        {
          "text": " — множина значень незалежної змінної, "
        },
        {
          "text": "Y",
          "bold": true
        },
        {
          "text": " — множина значень залежної змінної. Функція — це правило, за допомогою якого за кожним значенням незалежної змінної з множини "
        },
        {
          "text": "X",
          "bold": true
        },
        {
          "text": " можна знайти єдине значення залежної змінної з множини "
        },
        {
          "text": "Y",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Найбільше і найменше значення функції"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Число "
        },
        {
          "text": "\\(f (x_{0})\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають найбільшим значенням функції "
        },
        {
          "text": "\\(f\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " на множині "
        },
        {
          "text": "\\(M\\subset{}D (f)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", якщо існує таке число "
        },
        {
          "text": "\\(x_{0}\\in{}M\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", що для всіх "
        },
        {
          "text": "\\(x\\in{}M\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " виконується нерівність "
        },
        {
          "text": "\\(f(x_{0})\\geq f(x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". "
        },
        {
          "text": " Число "
        },
        {
          "text": "\\(f(x_{0})\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають найменшим значенням функції "
        },
        {
          "text": "\\(f\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " на множині "
        },
        {
          "text": "\\(M\\subset{}D (f)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", якщо існує таке число "
        },
        {
          "text": "\\(x_{0}\\in{}M\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", що для всіх "
        },
        {
          "text": "\\(x\\in{}M\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " виконується нерівність "
        },
        {
          "text": "\\(f(x_{0})\\leq f(x)\\)",
          "math": true,
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Парні і непарні функції."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Функцію "
        },
        {
          "text": "\\(f\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають парною, якщо для будь-якого "
        },
        {
          "text": "\\(x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " із області визначення виконується рівність "
        },
        {
          "text": "\\(f (-x) = f (x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Функцію "
        },
        {
          "text": "\\(f\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають непарною, якщо для будь-якого "
        },
        {
          "text": "\\(x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " із області визначення виконується рівність "
        },
        {
          "text": "\\(f (-x) = -f (x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". "
        },
        {
          "text": "Область визначення ",
          "bold": true
        },
        {
          "text": "парної (непарної) функції є симетричною відносно початку координат. Вісь ординат є віссю симетрії графіка парної функції. Початок координат є центром симетрії графіка непарної функції."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Перетворення графіків функцій"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Графік функції "
        },
        {
          "text": "\\(y = f (kx)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " можна отримати з графіка функції "
        },
        {
          "text": "\\(y = f (x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " у результаті стискання в "
        },
        {
          "text": "\\(k\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " разів до осі ординат, якщо "
        },
        {
          "text": "\\(k > 1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", або в результаті розтягнення в "
        },
        {
          "text": "\\(1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " "
        },
        {
          "text": "\\(k\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "раза від осі ординат, якщо "
        },
        {
          "text": "\\(0 < k < 1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Графік функції "
        },
        {
          "text": "\\(y = f (-x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " можна отримати, відобразивши графік функції "
        },
        {
          "text": "\\(y = f (x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " симетрично відносно осі ординат."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Оборотна функція"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Функцію "
        },
        {
          "text": "\\(y = f (x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають оборотною, якщо для будь-якого "
        },
        {
          "text": "\\(y0\\in{}E (f)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " існує єдине "
        },
        {
          "text": "\\(x0\\in{}D (f)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " таке, що "
        },
        {
          "text": "\\(y0 = f (x0)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Якщо функція є зростаючою (спадною), то вона є оборотною."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Взаємно обернені функції"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Функції "
        },
        {
          "text": "\\(f\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і "
        },
        {
          "text": "\\(g\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають взаємно оберненими, якщо: "
        },
        {
          "text": "1) ",
          "bold": true
        },
        {
          "text": "\\(D (f) = E (g)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і "
        },
        {
          "text": "\\(E (f) = D (g))\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "; 2)",
          "bold": true
        },
        {
          "text": " для будь-якого "
        },
        {
          "text": "\\(x_{0}\\in{}D (f)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " із рівності "
        },
        {
          "text": "\\(f (x_{0}) = y_{0}\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " випливає, що "
        },
        {
          "text": "\\(g (y_{0}) = x_{0}\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", тобто "
        },
        {
          "text": "\\(g (f (x_{0})) = x_{0}\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Графіки взаємно обернених функцій симетричні відносно прямої "
        },
        {
          "text": "\\(y = x\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Якщо функція є зростаючою (спадною), то обернена до неї функція є також зростаючою (спадною)."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "6. Математичні вирази",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Ділення многочленів"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Говорять, що многочлен "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ділиться націло на тотожно не рівний нулю многочлен "
        },
        {
          "text": "\\(B\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", якщо існує такий многочлен "
        },
        {
          "text": "\\(Q\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", що для будь-якого "
        },
        {
          "text": "\\(x\\in{}R\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " виконується рівність "
        },
        {
          "text": "\\(A(x)=B(x)\\cdot Q(x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Многочлен "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають діленим, многочлен "
        },
        {
          "text": "\\(B\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — дільником, многочлен "
        },
        {
          "text": "\\(Q\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — часткою. "
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Для будь-якого многочлена "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і ненульового многочлена "
        },
        {
          "text": "\\(B\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " існує єдина пара многочленів "
        },
        {
          "text": "\\(Q\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і "
        },
        {
          "text": "\\(R\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " таких, що "
        },
        {
          "text": "\\(A(x)= B(x)\\cdot Q(x)+ R(x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", де ступінь многочлена "
        },
        {
          "text": "\\(R\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " менший від ступеня многочлена "
        },
        {
          "text": "\\(B\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " або "
        },
        {
          "text": "\\(R\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — нульовий многочлен. У цій рівності многочлен "
        },
        {
          "text": "\\(Q\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають неповною часткою, а многочлен "
        },
        {
          "text": "\\(R\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — остачею. "
        },
        {
          "text": "Число "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " називають "
        },
        {
          "text": "коренем многочлена ",
          "bold": true
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", якщо "
        },
        {
          "text": "\\(A (a)= 0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Властивості коренів многочлена"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "both",
      "runs": [
        {
          "text": "Число "
        },
        {
          "text": "\\(a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " є коренем многочлена "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " тоді й тільки тоді, коли многочлен "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ділиться націло на двочлен "
        },
        {
          "text": "\\(x - a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Якщо "
        },
        {
          "text": "\\(\\{a_1,a_2,\\ldots,a_n\\}\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — множина коренів многочлена "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", то "
        },
        {
          "text": "\\(A(x)=(x-a_1)(x-a_2)\\cdot\\ldots\\cdot(x-a_n)\\cdot Q(x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", де "
        },
        {
          "text": "\\(Q\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " — деякий многочлен. Множина коренів многочлена ступеня "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " містить не більше, ніж "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " елементів. Якщо множина коренів многочлена "
        },
        {
          "text": "\\(a_nx^n+a_{n-1}x^{n-1}+\\ldots+a_1x+a_0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " містить більше, ніж "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " елементів, то "
        },
        {
          "text": "\\(a_n=a_{n-1}=\\ldots=a_1=a_0=0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", тобто цей многочлен "
        },
        {
          "text": "тотожно дорівнює нулю",
          "bold": true
        },
        {
          "text": ". "
        },
        {
          "text": " Якщо ціле раціональне рівняння із цілими коефіцієнтами має цілий корінь, то він є дільником вільного члена."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Теорема Безу"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Остача від ділення многочлена "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((x)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " на двочлен "
        },
        {
          "text": "\\(x-a\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " дорівнює "
        },
        {
          "text": "\\(A\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " ",
          "bold": true
        },
        {
          "text": "\\((a)\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Метод математичної індукції"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Нехай потрібно довести, що деяке твердження є правильним для будь-якого натурального значення "
        },
        {
          "text": "\\(n\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". Доведення цього факту методом математичної індукції складається з двох частин (теорем): 1) База індукції. Доводять (перевіряють) справедливість твердження для "
        },
        {
          "text": "\\(n = 1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ". 2) Індуктивний перехід. Роблять припущення, що твердження є правильним для "
        },
        {
          "text": "\\(n=k,\\)",
          "math": true,
          "bold": true
        },

        {
          "text": "  "
        },
        {
          "text": "\\(k\\in\\mathbb{N}\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", і на підставі цього доводять, що воно є правильним для "
        },
        {
          "text": "\\(n = k + 1\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    }
  ],
  "geometry-7": [
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "3. Елементарна планіметрія",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Геометричні об’єкти."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Точка",
          "bold": true,
          "underline": true
        },
        {
          "text": " - це геометричний об'єкт, що має тільки положення в просторі. Найпростіший геометричний об’єкт."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Пряма",
          "bold": true,
          "underline": true
        },
        {
          "text": " - лінія нескінченної довжини, проходить через дві точки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Промінь",
          "bold": true,
          "underline": true
        },
        {
          "text": " - частина прямої обмежена з однієї сторони."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Відрізок",
          "bold": true,
          "underline": true
        },
        {
          "text": " - частина прямої обмежена з двох сторін; найкоротша лінія, що з’єднує дві точки."
        },
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Кут",
          "bold": true,
          "underline": true
        },
        {
          "text": " - геометрична фігура, утворена двома променями, які виходять з однієї точки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Трикутник",
          "bold": true,
          "underline": true
        },
        {
          "text": " - геометрична фігура, яка складається з трьох точок, що "
        },
        {
          "text": "не лежать на одній прямій",
          "italic": true
        },
        {
          "text": ", і трьох відрізків, які їх сполучають."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Коло",
          "bold": true,
          "underline": true
        },
        {
          "text": " - це геометричне місце точок площини, відстань від яких до заданої точки, є сталою величиною."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Зв’язки між геометричними об’єктами"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Дві точки",
          "bold": true,
          "underline": true
        },
        {
          "text": " - дозволяють визначити: "
        },
        {
          "text": "відрізок",
          "bold": true
        },
        {
          "text": ", "
        },
        {
          "text": "промінь ",
          "bold": true
        },
        {
          "text": "та "
        },
        {
          "text": "пряму",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Два променя",
          "bold": true,
          "underline": true
        },
        {
          "text": " - що виходять з однієї точки утворюють "
        },
        {
          "text": "кут",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Дві прямі",
          "bold": true,
          "underline": true
        },
        {
          "text": " - що перетинаються, утворюють "
        },
        {
          "text": "перетин прямих",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Три відрізка",
          "bold": true,
          "underline": true
        },
        {
          "text": " - які з’єднують "
        },
        {
          "text": "три точки",
          "bold": true,
          "underline": true
        },
        {
          "text": ", що не лежать на одній прямій, утворюють "
        },
        {
          "text": "трикутник",
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Інші визначення"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Множина",
          "bold": true
        },
        {
          "text": " - сукупність, зібрання деяких об’єктів будь-якої природи."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Геометричне місце точок",
          "bold": true
        },
        {
          "text": " - це множина точок, що володіє деякою властивістю."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Відстань",
          "bold": true
        },
        {
          "text": " - числове значення того, наскільки далеко знаходяться точки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Довжина",
          "bold": true
        },
        {
          "text": " - відстань від точки до точки вздовж деякої лінії."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "7. Обрахункова геометрія",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Властивості відрізків"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        2518,
        8470
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/01-image1.png",
                  "alt": "Ілюстрація 1 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Довжина відрізка",
                      "bold": true
                    },
                    {
                      "text": " - відстань між точками "
                    },
                    {
                      "text": "\\(A\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(B\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": "."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "точка ",
                      "bold": true
                    },
                    {
                      "text": "\\(C\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " лежить на відрізку "
                    },
                    {
                      "text": "\\(AB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", то"
                    },
                    {
                      "text": " довжина",
                      "bold": true
                    },
                    {
                      "text": " відрізка "
                    },
                    {
                      "text": "\\(AB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " дорівнює сумі довжин відрізків "
                    },
                    {
                      "text": "\\(AC\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(CB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", тобто "
                    },
                    {
                      "text": "\\(AB = AC + CB \\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " ("
                    },
                    {
                      "text": "основна властивість довжини відрізка",
                      "italic": true
                    },
                    {
                      "text": ")"
                    }
                  ]
                },
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Градусна міра кутів."
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        2475,
        1965,
        2280,
        2130
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/02-image2.png",
                  "alt": "Ілюстрація 2 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/03-image3.png",
                  "alt": "Ілюстрація 3 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/04-image4.png",
                  "alt": "Ілюстрація 4 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/05-image5.png",
                  "alt": "Ілюстрація 5 до матеріалу «Геометрія 7 клас»"
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Гострий ",
                      "bold": true
                    },
                    {
                      "text": "\\(\\;0^{\\circ}<\\alpha<90^{\\circ}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Прямий ",
                      "bold": true
                    },
                    {
                      "text": "\\(\\;\\alpha=90^{\\circ}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Тупий ",
                      "bold": true
                    },
                    {
                      "text": "\\(\\;90^{\\circ}<\\alpha<180^{\\circ}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Розгорнутий ",
                      "bold": true
                    },
                    {
                      "text": "\\(\\;\\alpha=180^{\\circ}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Сума кутів"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        1830,
        3120,
        1875,
        4050
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/06-image6.png",
                  "alt": "Ілюстрація 6 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо промінь "
                    },
                    {
                      "text": "\\(OC\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " ділить кут "
                    },
                    {
                      "text": "\\(AOB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " на два кути "
                    },
                    {
                      "text": "\\(AOC\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(COB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "то "
                    },
                    {
                      "text": "\\(\\angle{}AOB =\\angle{}AOC +\\angle{}COB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": "."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "\\(\\angle{}AOC =\\angle{}COB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", то "
                    },
                    {
                      "text": "\\(OC\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " називають "
                    },
                    {
                      "text": "бісектрисою",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/07-image7.png",
                  "alt": "Ілюстрація 7 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Два кути утворюють розгорнутий кут - їх називають "
                    },
                    {
                      "text": "суміжними",
                      "bold": true
                    },
                    {
                      "text": ", сума їх градусних мір дорівнює "
                    },
                    {
                      "text": "\\(180^{\\circ}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "(одна сторона спільна, а дві інші лежать на одній прямій і не збігаються) "
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Пряма. Перетин прямих. Вертикальні кути."
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        2280,
        2580,
        2955,
        2955
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/08-image8.png",
                  "alt": "Ілюстрація 8 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/09-image9.png",
                  "alt": "Ілюстрація 9 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/10-image10.png",
                  "alt": "Ілюстрація 10 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/11-image11.png",
                  "alt": "Ілюстрація 11 до матеріалу «Геометрія 7 клас»"
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Через будь-які дві точки можна провести пряму, і тільки одну."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Дві прямі називають "
                    },
                    {
                      "text": "паралельними",
                      "bold": true
                    },
                    {
                      "text": ", якщо вони не перетинаються."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Будь-які дві прямі, що перетинаються, мають тільки "
                    },
                    {
                      "text": "одну спільну точку",
                      "bold": true
                    },
                    {
                      "text": "."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Перетин прямих ",
                      "bold": true
                    },
                    {
                      "text": "утворює 2 пари вертикальних кутів"
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Градусні міри вертикальних кутів є рівними."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Паралельні прямі та січна"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        3285,
        7470
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/12-image12.png",
                  "alt": "Ілюстрація 12 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/13-image13.png",
                  "alt": "Ілюстрація 13 до матеріалу «Геометрія 7 клас»"
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо при перетині двох прямих "
                    },
                    {
                      "text": "\nсічною відповідні кути рівні, "
                    },
                    {
                      "text": "\nто прямі паралельні"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо дві прямі "
                    },
                    {
                      "text": "\\(a\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " перетнути третьою прямою "
                    },
                    {
                      "text": "\\(c\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", то утвориться вісім кутів. Пряму "
                    },
                    {
                      "text": "\\(c\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " називають "
                    },
                    {
                      "text": "січною",
                      "bold": true
                    },
                    {
                      "text": " прямих "
                    },
                    {
                      "text": "\\(a\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ". Кути "
                    },
                    {
                      "text": "\\(3\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(6\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(4\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(5\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " називають односторонніми. Кути "
                    },
                    {
                      "text": "\\(3\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(5\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(4\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(6\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " називають різносторонніми. Кути "
                    },
                    {
                      "text": "\\(6\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(2\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(5\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(1\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(3\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(7\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(4\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " і "
                    },
                    {
                      "text": "\\(8\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " називають відповідними."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Трикутник"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "topAligned": true,
      "columnWidths": [
        2370,
        3075,
        2235,
        3390
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Трикутник ",
                      "bold": true,
                      "underline": true
                    }
                  ]
                },
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/14-image14.png",
                  "alt": "Ілюстрація 14 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Периметром",
                      "bold": true
                    },
                    {
                      "text": " трикутника називають суму довжин усіх його сторін."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/15-image15.png",
                  "alt": "Ілюстрація 15 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Кути "
                    },
                    {
                      "text": "\\(\\angle BAC\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(\\angle ABC\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(\\angle BCA\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " називають внутрішніми кутами трикутника "
                    },
                    {
                      "text": "\\(ABC\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": "."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Їх сума завжди дорівнює "
                    },
                    {
                      "text": "\\(180^{\\circ}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Бісектриса, медіана, висота трикутника"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "topAligned": true,
      "columnWidths": [
        3593,
        3592,
        3592
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(BD\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " – це бісектриса"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(BD\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " – це медіана"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(BD\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " – це висота"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/16-image16.png",
                  "alt": "Ілюстрація 16 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/17-image17.png",
                  "alt": "Ілюстрація 17 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/18-image18.png",
                  "alt": "Ілюстрація 18 до матеріалу «Геометрія 7 клас»"
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Відрізок бісектриси кута трикутника, який сполучає вершину трикутника з точкою протилежної сторони, називають "
                    },
                    {
                      "text": "бісектрисою",
                      "bold": true
                    },
                    {
                      "text": " трикутника."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Відрізок, який сполучає вершину трикутника із серединою протилежної сторони, називають "
                    },
                    {
                      "text": "медіаною",
                      "bold": true
                    },
                    {
                      "text": " трикутника."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": " Перпендикуляр",
                      "italic": true
                    },
                    {
                      "text": ", опущений з вершини трикутника на пряму, яка містить протилежну сторону, називають "
                    },
                    {
                      "text": "висотою",
                      "bold": true
                    },
                    {
                      "text": " трикутника."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Типи трикутників та їх властивості"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "topAligned": true,
      "columnWidths": [
        1680,
        1695,
        1875,
        1725,
        1620,
        2175
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/19-image19.png",
                  "alt": "Ілюстрація 19 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "2 сторони рівні."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Кути при основі - рівні."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Медіана, проведена до основи є бісектрисою та висотою."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/20-image20.png",
                  "alt": "Ілюстрація 20 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Всі сторони рівні."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Всі кути рівні і дорівнюють "
                    },
                    {
                      "text": "\\(60^{\\circ}\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": "."
                    },
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Медіана, проведена до будь-якої сторони є бісектрисою та висотою."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/21-image21.png",
                  "alt": "Ілюстрація 21 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(\\angle{}C = 90^{\\circ}\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": "."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Катет навпроти кута в "
                    },
                    {
                      "text": "\\(30^{\\circ}\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " дорівнює половині гіпотенузи."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Якщо "
                    },
                    {
                      "text": "\\(a\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ", "
                    },
                    {
                      "text": "\\(b\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " - катети, "
                    },
                    {
                      "text": "\\(a\\,c\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " - гіпотенуза, то "
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a<c,\\;b<c,\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "\\(a^{2}+b^{2}=c^{2}\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Рівнобедрений",
                      "bold": true
                    }
                  ]
                }
              ],
              "colSpan": 2
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Рівносторонній",
                      "bold": true
                    }
                  ]
                }
              ],
              "colSpan": 2
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "center",
                  "runs": [
                    {
                      "text": "Прямокутний",
                      "bold": true
                    }
                  ]
                }
              ],
              "colSpan": 2
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Ознаки рівності трикутників"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        4035,
        4680,
        2235
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/22-image22.png",
                  "alt": "Ілюстрація 22 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/23-image23.png",
                  "alt": "Ілюстрація 23 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/24-image24.png",
                  "alt": "Ілюстрація 24 до матеріалу «Геометрія 7 клас»"
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "1. за двома сторонами та кутом між ними"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "2. стороною та двома прилеглими до неї кутами"
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "3. за трьома сторонами"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Геометричне місце точок"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Серединний перпендикуляр відрізка є геометричним місцем точок, рівновіддалених від кінців цього відрізка."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Бісектриса кута є геометричним місцем точок, які належать куту й рівновіддалені від його сторін."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Коло є ",
          "bold": true
        },
        {
          "text": "геометричним місцем точок, відстані від яких до заданої точки дорівнюють даному додатному числу."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Коло"
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "topAligned": true,
      "columnWidths": [
        2115,
        6780,
        2100
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/25-image25.png",
                  "alt": "Ілюстрація 25 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Будь-який відрізок, який сполучає точку кола з його центром, називають "
                    },
                    {
                      "text": "радіусом",
                      "bold": true
                    },
                    {
                      "text": " кола. "
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Відрізок, який сполучає дві точки кола, називають "
                    },
                    {
                      "text": "хордою",
                      "bold": true
                    },
                    {
                      "text": " кола."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Хорду",
                      "bold": true
                    },
                    {
                      "text": ", яка проходить через центр кола, називають "
                    },
                    {
                      "text": "діаметром",
                      "bold": true
                    },
                    {
                      "text": "."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Пряму, яка має з колом тільки одну спільну точку, називають "
                    },
                    {
                      "text": "дотичною ",
                      "bold": true
                    },
                    {
                      "text": " до кола."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/26-image26.png",
                  "alt": "Ілюстрація 26 до матеріалу «Геометрія 7 клас»"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Властивості діаметра, радіуса та дотичної"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "body",
      "align": "left",
      "runs": [
        {
          "text": "Діаметр кола, перпендикулярний до хорди, ділить цю хорду навпіл. Діаметр кола, який ділить хорду, відмінну від діаметра, навпіл, перпендикулярний до цієї хорди. Дотична до кола перпендикулярна до радіуса, проведеного в точку дотику. Дотична перпендикулярна до радіуса, проведеного в точку дотику."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Описане та вписане коло трикутника"
        },
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "topAligned": true,
      "columnWidths": [
        1605,
        7545,
        1845
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/27-image27.png",
                  "alt": "Ілюстрація 27 до матеріалу «Геометрія 7 клас»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Коло називають описаним навколо трикутника, якщо воно проходить через усі його вершини. "
                    },
                    {
                      "text": "Центр кола, описаного навколо трикутника, — це точка перетину серединних перпендикулярів сторін трикутника."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Центр кола, вписаного в трикутник, — це точка перетину бісектрис трикутника."
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/geometry-7/28-image28.png",
                  "alt": "Ілюстрація 28 до матеріалу «Геометрія 7 клас»"
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "circle-and-angles": [
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "7. Обрахункова геометрія",
          "bold": true
        }
      ]
    },
    {
      "type": "table",
      "variant": "grid",
      "columnWidths": [
        1876,
        7796
      ],
      "rows": [
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Малюнок",
                      "bold": true
                    }
                  ]
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Теорія до малюнку",
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/circle-and-angles/01-image1.png",
                  "alt": "Ілюстрація 1 до матеріалу «Коло та кути»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Центральний кут",
                      "bold": true
                    },
                    {
                      "text": " кола - кут з вершиною в центрі кола"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/circle-and-angles/02-image2.png",
                  "alt": "Ілюстрація 2 до матеріалу «Коло та кути»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "both",
                  "runs": [
                    {
                      "text": "Дуга",
                      "bold": true
                    },
                    {
                      "text": " кола — це одна з двох частин (підмножин) кола, на які його розбивають дві точки кола. Кожна дуга має градусну міру. Градусна міра всього кола дорівнює 360°."
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "both",
                  "runs": [
                    {
                      "text": "Кут ділить коло на дуги. "
                    },
                    {
                      "text": "\\(\\cup ADB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " та "
                    },
                    {
                      "text": "\\(\\cup ACB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": ". Кут "
                    },
                    {
                      "text": "\\(\\angle AOB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " спирається на дугу "
                    },
                    {
                      "text": "\\(\\cup ADB\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "both",
                  "runs": [
                    {
                      "text": "Градусна міра",
                      "bold": true
                    },
                    {
                      "text": " дуги, дорівнює градусній мірі центрального кута, який на неї спирається. "
                    },
                    {
                      "text": " "
                    },
                    {
                      "text": "\\(\\cup ADB=\\angle AOB\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/circle-and-angles/03-image3.png",
                  "alt": "Ілюстрація 3 до матеріалу «Коло та кути»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Хорда",
                      "bold": true
                    },
                    {
                      "text": " – це відрізок, що з'єднує дві точки, що лежать на колі. "
                    },
                    {
                      "text": "CD – ",
                      "bold": true
                    },
                    {
                      "text": "Хорда. "
                    },
                    {
                      "text": "Хорда CD стягує дугу "
                    },
                    {
                      "text": "\\(\\cup CED\\)",
                      "math": true,
                      "bold": true
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/circle-and-angles/04-image4.png",
                  "alt": "Ілюстрація 4 до матеріалу «Коло та кути»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Вписаний кут - ",
                      "bold": true
                    },
                    {
                      "text": "вершина кута належить колу, а сторони перетинають коло. "
                    },
                    {
                      "text": "Градусна міра вписаного кута дорівнює половині градусної міри дуги, на яку він спирається"
                    }
                  ]
                },
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "both",
                  "runs": [
                    {
                      "text": "Властивості вписаних кутів: ",
                      "bold": true
                    },
                    {
                      "text": "1) Вписані кути, які спираються на одну й ту саму дугу, рівні; 2) Вписаний кут, який спирається на діаметр (півколо), — прямий."
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/circle-and-angles/05-image5.png",
                  "alt": "Ілюстрація 5 до матеріалу «Коло та кути»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Градусна міра вписаного кута дорівнює половині градусної міри дуги, на яку він спирається"
                    },
                    {
                      "text": ". "
                    },
                    {
                      "text": "\\(\\angle AOB\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": " = "
                    },
                    {
                      "text": "\\(\\frac{1}{2}\\)",
                      "math": true,
                      "bold": true
                    },
                    {
                      "text": "\\(\\angle ACB\\)",
                      "math": true,
                      "bold": true
                    },
                  ]
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "/materials/source/circle-and-angles/06-image6.png",
                  "alt": "Ілюстрація 6 до матеріалу «Коло та кути»"
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "paragraph",
                  "variant": "body",
                  "align": "left",
                  "runs": [
                    {
                      "text": "Дотична - ",
                      "bold": true
                    },
                    {
                      "text": "пряма, що проходить через точку кола перпендикулярно до радіуса, проведеного в цю точку."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "math-7-algorithms": [
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "7. Рівняння",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм №1. Вирішення рівнянь:"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Перенесіть "
        },
        {
          "text": "доданки",
          "italic": true
        },
        {
          "text": ", які містять "
        },
        {
          "text": "невідоме",
          "bold": true,
          "underline": true
        },
        {
          "text": " у ліву частину рівняння, а відомі — у праву, змінивши їхній знак на протилежний."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Виконайте "
        },
        {
          "text": "зведення",
          "bold": true,
          "underline": true
        },
        {
          "text": " подібних",
          "italic": true
        },
        {
          "text": " доданків."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Поділіть ліву та праву частини рівняння на "
        },
        {
          "text": "коефіцієнт",
          "italic": true
        },
        {
          "text": " при невідомому, якщо він не дорівнює нулю."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "4. Запишіть відповідь."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм №2. Вирішення рівнянь:"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Розкрийте дужки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Перенесіть невідомі доданки у ліву частину рівняння, а відомі — у праву, змінивши їхній знак на протилежний."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Виконайте зведення подібних доданків."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "4. Поділіть ліву та праву частини рівняння на коефіцієнт при невідомому, якщо він не дорівнює нулю."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "5. Запишіть відповідь."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм №3. Вирішення рівнянь:"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Знайдіть "
        },
        {
          "text": "найменший спільний знаменник",
          "bold": true,
          "underline": true
        },
        {
          "text": " усіх дробів."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Домножте кожний член рівняння на найменший спільний знаменник та скоротіть дріб."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. "
        },
        {
          "text": "Розкрийте дужки",
          "bold": true,
          "underline": true
        },
        {
          "text": ", якщо вони є."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "4. Перенесіть доданки, які містять невідоме, у ліву частину рівняння, а відомі — у праву, змінивши знаки на протилежні."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "5. Виконайте зведення подібних доданків."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "6. Поділіть ліву та праву частини рівняння на коефіцієнт при невідомому, якщо він не дорівнює нулю."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "7. Запишіть відповідь."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "12. Текстові задачі",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Розв’язування задач"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм №1"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "(на складання рівняння)"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Зробіть аналіз умови."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. "
        },
        {
          "text": "Перекладіть",
          "bold": true,
          "underline": true
        },
        {
          "text": " задачу зі звичайної мови на мову "
        },
        {
          "text": "алгебраїчну",
          "bold": true,
          "underline": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Невідому величину позначте через "
        },
        {
          "text": "\\(X\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "4. Встановіть залежність між даними задачі та змінною."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "5. Складіть рівняння та розв’яжіть його."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "6. Запишіть відповідь."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм №2"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "(на складання системи рівнянь)"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Зробіть аналіз умови."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Виділіть дві ситуації."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Перекладіть задачу зі звичайної мови на мову алгебраїчну."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "4. Введіть змінні."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "5. Встановіть залежність між даними задачі та змінними."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "6. Складіть рівняння."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "7. Розв’яжіть систему рівнянь."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "8. Запишіть відповідь."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "6. Математичні вирази",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Множення одночленів. Піднесення одночлена до ступеня."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм №1"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Знайдіть добуток  коефіцієнтів."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Показники ступенів однакових змінних додайте."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Якщо змінна входить лише в один із множників, то допишіть її в добутку."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм №2"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Піднесіть до ступеня коефіцієнт одночлена."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Показник ступеня кожної змінної одночлена помножте на показник ступеня, до якого підноситься одночлен."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Многочлени"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм №1"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "(додавання многочленів)"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Запишіть послідовно у вигляді алгебраїчної суми всі члени многочлена."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Зведіть подібні доданки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм №2"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "(віднімання многочленів)"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Знайдіть або складіть різницю многочленів, беручи другий многочлен у дужки зі знаком мінус перед ним."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Розкрийте дужки, змінюючи знаки перед членами, що стоять у дужках, на протилежні."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Зведіть подібні доданки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм № 3"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "(добуток одночлена на многочлен)"
        },
        {
          "text": ""
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Помножте одночлен на кожний член многочлена."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Додайте одержані добутки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Виконайте зведення подібних доданків."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм № 4"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "(добуток многочлена на многочлен)"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Помножте кожний член першого многочлена на кожен член другого многочлена."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Додайте одержані добутки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Виконайте зведення подібних доданків."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм № 5"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "(розкладання многочлена на множники)"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Винесіть спільний множник за дужки, якщо він є."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Спробуйте застосувати формули скороченого множення."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Застосуйте спосіб групування, якщо попередні способи не дали результату."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "sectionHeading",
      "align": "left",
      "runs": [
        {
          "text": "8. Рівняння",
          "bold": true
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Системи рівнянь"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм № 1"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "(побудова графіка лінійного рівняння з двома змінними)"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Знайдіть значення "
        },
        {
          "text": "\\(Y\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", якщо "
        },
        {
          "text": "\\(X=0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Знайдіть значення "
        },
        {
          "text": "\\(X\\)",
          "math": true,
          "bold": true
        },
        {
          "text": ", якщо "
        },
        {
          "text": "\\(Y=0\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Зобразіть на координатній площині точки "
        },
        {
          "text": "\\(A\\,( 0; Y )\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " і "
        },
        {
          "text": "\\(B\\,( X; 0 )\\)",
          "math": true,
          "bold": true
        },
        {
          "text": "."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "4. Проведіть пряму через дві точки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм № 2"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Побудуйте графік кожного рівняння в одній системі координат."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Знайдіть точки перетину графіків."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Запишіть координати цієї точки."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм №3"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "(спосіб алгебраїчного додавання)"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Зрівняйте коефіцієнти при змінній "
        },
        {
          "text": "\\(X\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " або "
        },
        {
          "text": "\\(Y\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " так, щоб вони стали протилежними числами."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Додайте почленно ліві та праві частини одержаних рівнянь."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Розв’яжіть рівняння з однією змінною."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "4. Знайдене значення змінної підставте в будь-яке рівняння системи."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "5. Знайдіть значення другої змінної."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "6. Запишіть відповідь."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "Алгоритм № 4"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "subheading",
      "align": "center",
      "runs": [
        {
          "text": "(спосіб підстановки)"
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "1. Виразіть в одному з рівнянь одну змінну через іншу ( "
        },
        {
          "text": "\\(X\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " через "
        },
        {
          "text": "\\(Y\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " або "
        },
        {
          "text": "\\(Y\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " через "
        },
        {
          "text": "\\(X\\)",
          "math": true,
          "bold": true
        },
        {
          "text": " )."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "2. Підставте її значення в друге рівняння."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "3. Розв’яжіть рівняння з однією змінною."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "4. Знайдіть значення другої змінної."
        }
      ]
    },
    {
      "type": "paragraph",
      "variant": "listItem",
      "align": "left",
      "runs": [
        {
          "text": "5. Запишіть відповідь."
        }
      ]
    }
  ]
}
;
